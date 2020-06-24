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
import {
  OperationGuideInterface,
  PackingUnits,
  PalletChangesInterface,
  RefOrderType,
  RepackagingGuide,
  RepackedInvInfo
} from '../intefaces'

export const repackagingResolver = {
  async repackaging(_: any, { worksheetDetailName, fromPalletId, toPalletId, locationName }, context: any) {
    return await getManager().transaction(async (trxMgr: EntityManager) => {
      /**
       * Initialize required variables
       */
      const domain: Domain = context.state.domain
      const user: User = context.state.user

      const location: Location = await trxMgr.getRepository(Location).findOne({
        where: { domain, name: locationName },
        relations: ['warehouse']
      })
      if (!location) throw new Error(`Couldn't find location by its name (${locationName})`)
      const warehouse: Warehouse = location.warehouse
      if (!warehouse) throw new Error(`Location (name: ${locationName}) doesn't have any relation with warehouse`)

      // Find target worksheet detail & target order vas
      const wsd: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
        where: { domain, name: worksheetDetailName },
        relations: [
          'bizplace',
          'targetVas',
          'targetVas.inventory',
          'targetVas.inventory.product',
          'targetVas.vas',
          'targetVas.arrivalNotice',
          'targetVas.releaseGood',
          'targetVas.shippingOrder',
          'targetVas.vasOrder',
          'targetVas.targetProduct',
          'worksheet'
        ]
      })
      if (!wsd) throw new Error(`Couldn't find target worksheet detail`)

      const bizplace: Bizplace = wsd.bizplace
      let targetVas: OrderVas = wsd.targetVas
      if (!targetVas) throw new Error(`Couldn't find target vas`)

      let refOrder: RefOrderType
      if (targetVas?.arrivalNotice?.id) {
        refOrder = targetVas.arrivalNotice
      } else if (targetVas?.releaseGood?.id) {
        refOrder = targetVas.releaseGood
      } else if (targetVas?.shippingOrder?.id) {
        refOrder = targetVas.shippingOrder
      } else if (targetVas?.vasOrder?.id) {
        refOrder = targetVas.vasOrder
      }
      if (!refOrder) throw new Error(`Couldn't find reference order with current order vas`)

      // Assign inventory
      if (refOrder instanceof ArrivalNotice && !targetVas.inventory) {
        const inventory: Inventory = await trxMgr.getRepository(Inventory).findOne({
          where: {
            domain,
            bizplace,
            palletId: fromPalletId,
            status: In([INVENTORY_STATUS.UNLOADED, INVENTORY_STATUS.PUTTING_AWAY]),
            refOrderId: refOrder.id
          }
        })
        if (!inventory) throw new Error(`Counldn't find unloaded inventory by pallet ID: (${fromPalletId})`)

        targetVas.inventory = inventory
        targetVas.updater = user
        // 대상 inventory를 통해 현재 작업을 모두 처리 할 수 있는지 확인
        if (targetVas.qty > inventory.qty) {
          // 처리 불가한 경우 inventory가 할당되지 않은 새로운 worksheet을 생성하여
          // 남은 주문을 처리할 수 있도록해야함
          targetVas = await addNewVasTask(targetVas, inventory.qty, domain, bizplace, user, trxMgr, wsd)
        }

        targetVas = await trxMgr.getRepository(OrderVas).save(targetVas)
      } else if (refOrder instanceof ReleaseGood && !targetVas.inventory) {
        let pickedOrdInv: OrderInventory = await trxMgr.getRepository(OrderInventory).find({
          where: { domain, bizplace, releaseGood: refOrder, status: ORDER_INVENTORY_STATUS.PICKED },
          relations: ['inventory']
        })
        pickedOrdInv = pickedOrdInv.find((oi: OrderInventory) => oi.inventory.palletId === fromPalletId)
        const inventory: Inventory = pickedOrdInv?.inventory
        if (!inventory) throw new Error(`Couldn't find picked inventory by pallet ID: ${fromPalletId}`)

        targetVas.inventory = inventory
        targetVas.updater = user

        if (targetVas.qty > pickedOrdInv.releaseQty) {
          targetVas = await addNewVasTask(targetVas, pickedOrdInv.releaseQty, domain, bizplace, user, trxMgr, wsd)
        }

        targetVas = await trxMgr.getRepository(OrderVas).save(targetVas)
      }

      let originInv: Inventory = targetVas.inventory
      if (!originInv) throw new Error(`Inventory wasn't assigned to target vas`)
      let operationGuide: OperationGuideInterface<RepackagingGuide> = JSON.parse(targetVas.operationGuide)
      let operationGuideData: RepackagingGuide = operationGuide.data
      if (!operationGuideData.repackedInvs) operationGuideData.repackedInvs = []

      const { reducedQty, reducedWeight } = getReducedAmountByRepack(fromPalletId, operationGuideData.repackedInvs)
      const { remainQty, remainWeight } = await getRemainInventoryAmount(
        trxMgr,
        refOrder,
        domain,
        bizplace,
        originInv,
        reducedQty,
        reducedWeight
      )

      if (remainQty <= 0 || remainWeight <= 0) {
        throw new Error(`There's no more remaining product on the pallet (${fromPalletId})`)
      }
      const unitWeight: number = remainWeight / remainQty
      let repackedInv: RepackedInvInfo = getRepackedInv(operationGuideData, toPalletId, locationName)

      const packingUnit: string = operationGuideData.packingUnit
      const stdAmount: number = operationGuideData.stdAmount

      let isCompleted: boolean = false // Flag for calling executeVas function to change status of worksheet detail
      if (packingUnit === PackingUnits.QTY) {
        // 현재 from pallet의 유효 수량이 기준 수량을 넘어서는 경우 기준 수량이 감소
        // 현재 from pallet의 유효 수량이 기준 수량 보다 적을 경우 남은 수량이 감소
        const reducedQty: number = remainQty >= stdAmount ? stdAmount : remainQty
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
        const reducedWeight: number = remainWeight >= stdAmount ? stdAmount : remainWeight
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

      operationGuide.completed = operationGuide.data.requiredPackageQty === 0

      // Update every order vas to share same operation guide
      const worksheet: Worksheet = wsd.worksheet
      const relatedWSDs: WorksheetDetail[] = await trxMgr.getRepository(WorksheetDetail).find({
        where: { domain, bizplace, worksheet },
        relations: ['targetVas', 'targetVas.vas']
      })

      const relatedOVs: OrderVas[] = relatedWSDs
        .map((wsd: WorksheetDetail) => wsd.targetVas)
        .filter((ov: OrderVas) => ov.set === targetVas.set && ov.vas.id === targetVas.vas.id)
        .map((ov: OrderVas) => {
          return {
            ...ov,
            operationGuide: JSON.stringify(operationGuide),
            updater: user
          }
        })

      await trxMgr.getRepository(OrderVas).save(relatedOVs)

      if (isCompleted) {
        await executeVas(trxMgr, wsd, domain, user)
      }
    })
  }
}

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
  delete copiedTargetVas.inventory

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

/**
 * @description Loop through whole repacked to return total reduced amount
 * from information which is describing any changes about qty and weight of inventory or order inventories (for R.O case)
 * @param palletId
 * @param repackedInvs
 */
function getReducedAmountByRepack(
  palletId: string,
  repackedInvs: RepackedInvInfo[]
): { reducedQty: number; reducedWeight: number } {
  const repackedFromList: PalletChangesInterface[] = repackedInvs
    .map((repackedInv: RepackedInvInfo) => repackedInv.repackedFrom)
    .flat()
  return repackedFromList
    .filter((repackedFrom: PalletChangesInterface) => repackedFrom.fromPalletId === palletId)
    .reduce(
      (reducedAmount: { reducedQty: number; reducedWeight: number }, rf: PalletChangesInterface) => {
        return {
          reducedQty: reducedAmount.reducedQty + rf.reducedQty,
          reducedWeight: reducedAmount.reducedWeight + rf.reducedWeight
        }
      },
      { reducedQty: 0, reducedWeight: 0 }
    )
}

async function getRemainInventoryAmount(
  trxMgr: EntityManager,
  refOrder: RefOrderType,
  domain: Domain,
  bizplace: Bizplace,
  originInv: Inventory,
  reducedQty: number,
  reducedWeight: number
): Promise<{ remainQty: number; remainWeight: number }> {
  let remainQty: number = 0
  let remainWeight: number = 0

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
  return { remainQty, remainWeight }
}
