import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import {
  ArrivalNotice,
  OrderInventory,
  OrderNoGenerator,
  OrderVas,
  ORDER_INVENTORY_STATUS,
  ReleaseGood
} from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory, INVENTORY_STATUS, Location, Warehouse } from '@things-factory/warehouse-base'
import { EntityManager, getManager, In } from 'typeorm'
import { WORKSHEET_TYPE } from '../../../../../constants'
import { Worksheet, WorksheetDetail } from '../../../../../entities'
import { WorksheetNoGenerator } from '../../../../../utils'
import { executeVas } from '../../execute-vas'
import {
  OperationGuideInterface,
  PalletChangesInterface,
  RefOrderType,
  RepalletizedInvInfo,
  RepalletizingGuide
} from '../interfaces'

export const repalletizingResolver = {
  async repalletizing(_: any, { worksheetDetailName, fromPalletId, toPalletId, locationName }, context: any) {
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
      const isInvExisting: number = await trxMgr.getRepository(Inventory).count({
        where: { domain, bizplace, palletId: toPalletId }
      })
      if (isInvExisting) throw new Error(`The Pallet (${toPalletId}) is alread exsits.`)
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

      // Inventory Assignment
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
        targetVas = await trxMgr.getRepository(OrderVas).save(targetVas)
      }

      let operationGuide: OperationGuideInterface<RepalletizingGuide> = JSON.parse(targetVas.operationGuide)
      let operationGuideData = operationGuide.data

      if (!operationGuideData.requiredPalletQty) throw new Error(`No more repalletizing is needed.`)

      let originInv: Inventory = targetVas.inventory
      let unitWeight: number = 0
      const stdQty: number = operationGuideData.stdQty
      if (!operationGuideData.repalletizedInvs) operationGuideData.repalletizedInvs = []
      const repalletizedInvs: RepalletizedInvInfo[] = operationGuideData.repalletizedInvs
      const usedQty: number = getUsedQty(repalletizedInvs, fromPalletId)
      const repalletizedQty: number = getRepalletizedQty(repalletizedInvs, toPalletId) // toPalletId에 현재 포함되어 있는 수량
      const remainQty: number = stdQty - repalletizedQty // 완성된 하나이 pallet을 만들기 위해 남겨진 수량
      if (remainQty === 0) throw new Error(`The pallet (${toPalletId}) already has enough quantity of product`)
      let newlyRepalletizedQty: number = 0

      let availableQty: number = 0 // 현재 작업 대상 인벤토리에서 사용 가능한 수량
      if (refOrder instanceof ReleaseGood) {
        // If the vas comes with Release Order
        // Available qty for repalletizing should be calculated with qty of order inventory
        const pickingWS: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
          where: { domain, bizplace, releaseGood: refOrder, type: WORKSHEET_TYPE.PICKING },
          relations: [
            'worksheetDetails',
            'worksheetDetails.targetInventory',
            'worksheetDetails.targetInventory.inventory'
          ]
        })
        const targetInv: OrderInventory = pickingWS.worksheetDetails
          .map((wsd: WorksheetDetail) => wsd.targetInventory)
          .find((oi: OrderInventory) => oi.inventory.palletId === fromPalletId)
        availableQty = targetInv.releaseQty - usedQty

        unitWeight = targetInv.releaseWeight / targetInv.releaseQty
        newlyRepalletizedQty = availableQty >= remainQty ? remainQty : availableQty
      } else {
        // If the vas comes with GAN or Pure VAS
        // Available qty for repalletizing should be calculated with qty of inventory
        availableQty = originInv.qty - usedQty
        unitWeight = originInv.weight / originInv.qty
        newlyRepalletizedQty = availableQty >= remainQty ? remainQty : availableQty
      }

      const repalletizedFrom: PalletChangesInterface = {
        fromPalletId,
        toPalletId,
        reducedQty: newlyRepalletizedQty,
        reducedWeight: newlyRepalletizedQty * unitWeight
      }

      const repalletiziedInv: RepalletizedInvInfo = getRepalletizedInv(operationGuideData, toPalletId, locationName)
      repalletiziedInv.repalletizedFrom.push(repalletizedFrom)

      const isCompleted: boolean = remainQty - newlyRepalletizedQty <= 0
      let requiredPalletQty: number = isCompleted
        ? operationGuideData.requiredPalletQty - 1
        : operationGuideData.requiredPalletQty

      // 현재 repalletizing을 통해 감소하는 수량의 인벤토리가 모두 소진되지 않은 경우에는
      // 새로운 작업을 생성해선 안된다.
      // 현재 작업이 수행중인 inventory의 수량이 전부 소진되었는데도 필요한 pallet의 수량을 충족시키지 못할 경우
      // 새로운 vas task를 생성해야한다
      const isNoMoreProduct: boolean = availableQty - newlyRepalletizedQty === 0
      if (requiredPalletQty && isNoMoreProduct) {
        if (refOrder instanceof ArrivalNotice || refOrder instanceof ReleaseGood) {
          await addNewVasTask(targetVas, targetVas.qty - stdQty, domain, bizplace, user, trxMgr, wsd)
        }
      }

      operationGuide.data = {
        palletType: operationGuideData.palletType,
        stdQty: operationGuideData.stdQty,
        requiredPalletQty,
        repalletizedInvs
      }

      await updateRelatedOrderVas(trxMgr, domain, bizplace, wsd, targetVas, operationGuide, user)

      // 완료되지 않았고 제품도 부족하지 않은 경우를 제외한 모든 케이스에 대해 완료 처리함
      if (!(!isCompleted && !isNoMoreProduct)) {
        await executeVas(trxMgr, wsd, domain, user)
      }
    })
  }
}

/**
 * @description Update every related order vas to share same operationGuide data
 *
 * @param {EntityManager} trxMgr
 * @param {Domain} domain
 * @param {Bizplace} bizplace
 * @param {WorksheetDetail} wsd
 * @param {OrderVas} targetVas
 * @param {OperationGuideInterface<RepalletizingGuide>} operationGuide
 * @param {User} user
 */
async function updateRelatedOrderVas(
  trxMgr: EntityManager,
  domain: Domain,
  bizplace: Bizplace,
  wsd: WorksheetDetail,
  targetVas: OrderVas,
  operationGuide: OperationGuideInterface<RepalletizingGuide>,
  user: User
) {
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
}

/**
 * @description 전달받은 pallet 아이디와 동일한 repalletized 된 pallet을 찾아 return
 * 이미 처리된 pallet이 없을 경우 새로운 object를 생성하고 return 함
 *
 * @param operationGuideData
 * @param palletId
 */
function getRepalletizedInv(
  operationGuideData: RepalletizingGuide,
  palletId: string,
  locationName: string
): RepalletizedInvInfo {
  let repalletizedInv: RepalletizedInvInfo = operationGuideData.repalletizedInvs.find(
    (ri: RepalletizedInvInfo) => ri.palletId === palletId
  )

  if (!repalletizedInv) {
    repalletizedInv = {
      palletId,
      locationName,
      repalletizedFrom: []
    }
    operationGuideData.repalletizedInvs.push(repalletizedInv)
  }
  return repalletizedInv
}

/**
 * fromPalletId를 통해 이미 처리된 수량을 return
 * from pallet의 잔여수량을 구하기 위해 사용된 수량을 계산함
 * @param repalletizedInvs
 * @param fromPalletId
 */
function getUsedQty(repalletizedInvs: RepalletizedInvInfo[], fromPalletId: string): number {
  return repalletizedInvs
    .map((ri: RepalletizedInvInfo) => ri.repalletizedFrom)
    .flat()
    .filter((rf: PalletChangesInterface) => rf.fromPalletId === fromPalletId)
    .reduce((usedQty: number, rf: PalletChangesInterface) => (usedQty += rf.reducedQty), 0)
}

/**
 * toPalletId가 생성되기 위해 사용된 모든 제품 수량 (현재까지 완성된 수량)을 return
 * @param repalletizedInvs
 * @param toPalletId
 */
function getRepalletizedQty(repalletizedInvs: RepalletizedInvInfo[], toPalletId: string): number {
  return repalletizedInvs
    .map((ri: RepalletizedInvInfo) => ri.repalletizedFrom)
    .flat()
    .filter((rf: PalletChangesInterface) => rf.toPalletId === toPalletId)
    .reduce((reducedQty: number, rf: PalletChangesInterface) => (reducedQty += rf.reducedQty), 0)
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
