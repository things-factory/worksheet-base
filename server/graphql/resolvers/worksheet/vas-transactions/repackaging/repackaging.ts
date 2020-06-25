import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import {
  ArrivalNotice,
  OrderInventory,
  OrderNoGenerator,
  OrderVas,
  ORDER_INVENTORY_STATUS,
  ORDER_TYPES,
  ReleaseGood
} from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory, INVENTORY_STATUS, Location, Warehouse } from '@things-factory/warehouse-base'
import { EntityManager, getManager, In } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../../../entities'
import { WorksheetNoGenerator } from '../../../../../utils'
import { executeVas } from '../../execute-vas'
import { getWorksheetDetailByName, updateRelatedOrderVas, getReducedAmount } from '../common-utils'
import {
  OperationGuideInterface,
  PackingUnits,
  PalletChangesInterface,
  RefOrderType,
  RepackagingGuide,
  RepackedInvInfo
} from '../interfaces'

export const repackagingResolver = {
  async repackaging(_: any, { worksheetDetailName, fromPalletId, toPalletId, locationName, times = 1 }, context: any) {
    return await getManager().transaction(async (trxMgr: EntityManager) => {
      const domain: Domain = context.state.domain
      const user: User = context.state.user
      const location: Location = await trxMgr.getRepository(Location).findOne({
        where: { domain, name: locationName },
        relations: ['warehouse']
      })
      if (!location) throw new Error(`Couldn't find location by its name (${locationName})`)
      const warehouse: Warehouse = location.warehouse
      if (!warehouse) throw new Error(`Location (name: ${locationName}) doesn't have any relation with warehouse`)

      // Find target worksheet detail & target order vas & bizplace
      const wsd: WorksheetDetail = await getWorksheetDetailByName(trxMgr, domain, worksheetDetailName)
      let { bizplace, targetVas }: { bizplace: Bizplace; targetVas: OrderVas } = wsd

      // Init refOrder
      const { arrivalNotice, releaseGood, vasOrder }: { [key: string]: RefOrderType } = targetVas
      const refOrder = arrivalNotice || releaseGood || vasOrder || null
      if (!refOrder) throw new Error(`Couldn't find reference order with current order vas`)

      // Assign inventory if specific inventory isn't assigned yet.
      // This case is occured when the VAS order comes with Arrival Notice or Release Good
      if (!targetVas.inventory) {
        targetVas = await assignInventory(trxMgr, domain, bizplace, wsd, refOrder, targetVas, times, fromPalletId, user)
      }

      let originInv: Inventory = targetVas.inventory
      let operationGuide: OperationGuideInterface<RepackagingGuide> = JSON.parse(targetVas.operationGuide)
      let operationGuideData: RepackagingGuide = operationGuide.data
      if (!operationGuideData.repackedInvs) operationGuideData.repackedInvs = []
      const palletChanges: PalletChangesInterface[] = operationGuideData.repackedInvs
        .map((ri: RepackedInvInfo) => ri.repackedFrom)
        .flat()
      const { remainQty, remainWeight } = await getRemainInventoryAmount(
        trxMgr,
        refOrder,
        domain,
        bizplace,
        originInv,
        palletChanges,
        fromPalletId
      )

      const unitWeight: number = remainWeight / remainQty
      const packingUnit: string = operationGuideData.packingUnit
      const stdAmount: number = operationGuideData.stdAmount
      let repackedInv: RepackedInvInfo = getRepackedInv(operationGuideData, toPalletId, locationName)

      let isCompleted: boolean = false // Flag for calling executeVas function to change status of worksheet detail
      if (packingUnit === PackingUnits.QTY) {
        // 현재 from pallet의 유효 수량이 기준 수량을 넘어서는 경우 기준 수량이 감소
        // 현재 from pallet의 유효 수량이 기준 수량 보다 적을 경우 남은 수량이 감소
        const reducedQty: number = remainQty >= stdAmount * times ? stdAmount * times : remainQty
        const repackedFrom: PalletChangesInterface = {
          fromPalletId,
          toPalletId,
          reducedQty,
          reducedWeight: reducedQty * unitWeight
        }

        repackedInv.repackedFrom.push(repackedFrom)
        const totalPackedQty: number = repackedInv.repackedFrom.reduce(
          (qty: number, rf: PalletChangesInterface) => (qty += rf.reducedQty),
          0
        )
        repackedInv.repackedPkgQty = totalPackedQty / stdAmount
        isCompleted = remainQty <= stdAmount
      } else if (packingUnit === PackingUnits.WEIGHT) {
        const reducedWeight: number = remainWeight >= stdAmount * times ? stdAmount * times : remainWeight
        const repackedFrom: PalletChangesInterface = {
          fromPalletId,
          toPalletId,
          reducedWeight,
          reducedQty: reducedWeight / unitWeight
        }

        repackedInv.repackedFrom.push(repackedFrom)
        const totalPackedWeight: number = repackedInv.repackedFrom.reduce(
          (weight: number, rf: PalletChangesInterface) => (weight += rf.reducedWeight),
          0
        )
        repackedInv.repackedPkgQty = totalPackedWeight / stdAmount
        isCompleted = remainWeight <= stdAmount
      }

      const requiredPackageQty: number = await getRequiredPackageQty(
        trxMgr,
        domain,
        bizplace,
        wsd.worksheet,
        packingUnit,
        stdAmount
      )
      const repackedPackageQty: number = getRepackedPackageQty(operationGuideData.repackedInvs)

      operationGuide.data = {
        packingUnit: operationGuideData.packingUnit,
        toPackingType: operationGuideData.toPackingType,
        stdAmount: operationGuideData.stdAmount,
        requiredPackageQty: requiredPackageQty - repackedPackageQty,
        repackedInvs: operationGuideData.repackedInvs
      }

      // Update every order vas to share same operation guide
      await updateRelatedOrderVas<RepackagingGuide>(trxMgr, domain, bizplace, wsd, targetVas, operationGuide, user)

      if (isCompleted) {
        await executeVas(trxMgr, wsd, domain, user)
      }
    })
  }
}

/**
 * @description Assign inventory to targetVas
 * When Vas order comes together with Arrival Notice or Release Good
 * The vas worksheet is activated automatically by to complete unloading/picking worksheet.
 * As a result user can't activate it manually, which means no assignment for every specific vas tasks.
 * For this case inventory should be assigned while processing the VAS Order.
 */
async function assignInventory(
  trxMgr: EntityManager,
  domain: Domain,
  bizplace: Bizplace,
  wsd: WorksheetDetail,
  refOrder: ArrivalNotice | ReleaseGood,
  targetVas: OrderVas,
  times: number,
  fromPalletId: string,
  user: User
): Promise<OrderVas> {
  let inventory: Inventory
  if (refOrder instanceof ArrivalNotice) {
    // Case 1. When the VAS Order comes with Arrival Notice
    inventory = await trxMgr.getRepository(Inventory).findOne({
      where: {
        domain,
        bizplace,
        palletId: fromPalletId,
        status: In([INVENTORY_STATUS.UNLOADED, INVENTORY_STATUS.PUTTING_AWAY]),
        refOrderId: refOrder.id
      }
    })
    if (!inventory) throw new Error(`Counldn't find unloaded inventory by pallet ID: (${fromPalletId})`)

    // Check current inventory has enough qty of product to complete this target vas.
    if (targetVas.qty * times > inventory.qty) {
      // If it doesn't have enough, Need to create new worksheet detail and target vas without inventory assignment
      // So the user can proceed it with another inventory
      targetVas = await addNewVasTask(targetVas, inventory.qty, domain, bizplace, user, trxMgr, wsd)
    }
  } else if (refOrder instanceof ReleaseGood) {
    // Case 2. When the VAS Order comes with Release Good
    // In this case, every available inventories are picked by picking worksheet.
    // So target inventories should be found by relation with order inventory which has PICKED status
    let pickedOrdInv: OrderInventory = await trxMgr.getRepository(OrderInventory).find({
      where: { domain, bizplace, releaseGood: refOrder, status: ORDER_INVENTORY_STATUS.PICKED },
      relations: ['inventory']
    })
    pickedOrdInv = pickedOrdInv.find((oi: OrderInventory) => oi.inventory.palletId === fromPalletId)
    inventory = pickedOrdInv?.inventory
    if (!inventory) throw new Error(`Couldn't find picked inventory by pallet ID: ${fromPalletId}`)

    // Check current target inventory (picked inventory) has enough qty of product to complete this target vas.
    // And available qty of products also restriced by picking. (Because customer requests do some vas for Release Order)
    if (targetVas.qty * times > pickedOrdInv.releaseQty) {
      // If it doesn't have enough, Need to create new worksheet detail and target vas without inventory assignment
      // So the user can proceed it with another inventory
      targetVas = await addNewVasTask(targetVas, pickedOrdInv.releaseQty, domain, bizplace, user, trxMgr, wsd)
    }

    targetVas.inventory = inventory
    targetVas.updater = user
    targetVas = await trxMgr.getRepository(OrderVas).save(targetVas)
  }

  return targetVas
}

/**
 * @description Create nw VAS Worksheet Detail & Order Vas
 * Without inventory assignment
 */
async function addNewVasTask(
  targetVas: OrderVas,
  currentOrderQty: number,
  domain: Domain,
  bizplace: Bizplace,
  user: User,
  trxMgr: EntityManager,
  wsd: WorksheetDetail
): Promise<OrderVas> {
  // 새로운 order vas와 worksheet detail 생성
  const copiedTargetVas: OrderVas = Object.assign({}, targetVas)
  delete copiedTargetVas.id

  let newTargetVas: OrderVas = {
    ...copiedTargetVas,
    domain,
    bizplace,
    name: OrderNoGenerator.orderVas(),
    qty: targetVas.qty - currentOrderQty,
    creator: user,
    updater: user
  }
  newTargetVas = await trxMgr.getRepository(OrderVas).save(newTargetVas)

  const copiedWSD: WorksheetDetail = Object.assign({}, wsd)
  delete copiedWSD.id

  const newWSD: WorksheetDetail = {
    ...copiedWSD,
    domain,
    bizplace,
    name: WorksheetNoGenerator.vasDetail(),
    seq: wsd.seq++,
    targetVas: newTargetVas,
    creator: user,
    updater: user
  }
  await trxMgr.getRepository(WorksheetDetail).save(newWSD)

  targetVas.qty = currentOrderQty
  return targetVas
}

function getRepackedPackageQty(repackedInvs: RepackedInvInfo[]): number {
  return repackedInvs.reduce((repackedPkgQty: number, ri: RepackedInvInfo) => (repackedPkgQty += ri.repackedPkgQty), 0)
}

async function getRequiredPackageQty(
  trxMgr: EntityManager,
  domain: Domain,
  bizplace: Bizplace,
  worksheet: Worksheet,
  packingUnit: string,
  stdAmount: number
): Promise<number> {
  const relatedWSDs: WorksheetDetail[] = await trxMgr.getRepository(WorksheetDetail).find({
    where: { domain, bizplace, worksheet },
    relations: ['targetVas', 'targetVas.vas']
  })

  const orderVASs: OrderVas[] = relatedWSDs.map((wsd: WorksheetDetail) => wsd.targetVas)
  const { qty, weight } = orderVASs.reduce(
    (total: { qty: number; weight: number }, ov: OrderVas) => {
      total.qty += ov.qty
      total.weight += ov.weight

      return total
    },
    { qty: 0, weight: 0 }
  )

  if (packingUnit === PackingUnits.QTY) {
    return qty / stdAmount
  } else if (packingUnit === PackingUnits.WEIGHT) {
    return weight / stdAmount
  }
}

/**
 * @description 전달받은 pallet 아이디와 동일한 repacked 된 pallet을 찾아 return
 * 이미 처리된 pallet이 없을 경우 새로운 object를 생성하고 return 함
 *
 * @param operationGuideData
 * @param palletId
 */
function getRepackedInv(operationGuideData: RepackagingGuide, palletId: string, locationName: string): RepackedInvInfo {
  let repackedInv: RepackedInvInfo = operationGuideData.repackedInvs.find(
    (ri: RepackedInvInfo) => ri.palletId === palletId
  )
  if (!repackedInv) {
    repackedInv = {
      palletId,
      locationName,
      repackedPkgQty: 0,
      repackedFrom: []
    }
    operationGuideData.repackedInvs.push(repackedInv)
  }

  return repackedInv
}

async function getRemainInventoryAmount(
  trxMgr: EntityManager,
  refOrder: RefOrderType,
  domain: Domain,
  bizplace: Bizplace,
  originInv: Inventory,
  palletChanges: PalletChangesInterface[],
  fromPalletId: string
): Promise<{ remainQty: number; remainWeight: number }> {
  let remainQty: number = 0
  let remainWeight: number = 0

  const { reducedQty, reducedWeight } = getReducedAmount(palletChanges, fromPalletId)

  if (refOrder instanceof ReleaseGood) {
    // Find loading order inventory to figure out unit weight
    const orderInv: OrderInventory = await trxMgr.getRepository(OrderInventory).findOne({
      where: { domain, bizplace, inventory: originInv, releaseGood: refOrder, type: ORDER_TYPES.RELEASE_OF_GOODS }
    })

    remainQty = orderInv.releaseQty - reducedQty
    remainWeight = orderInv.releaseWeight - reducedWeight
  } else {
    remainQty = originInv.qty - reducedQty
    remainWeight = originInv.weight - reducedWeight
  }

  if (remainQty <= 0 || remainWeight <= 0) throw new Error(`There's no more remaining product on the pallet`)
  return { remainQty, remainWeight }
}
