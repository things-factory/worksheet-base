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
import { Inventory, INVENTORY_STATUS } from '@things-factory/warehouse-base'
import { EntityManager, In } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../../entities'
import { WorksheetNoGenerator } from '../../../../utils'
import { OperationGuideInterface, PalletChangesInterface, RefOrderType } from './interfaces'

/**
 * @description Find worksheet detail by name
 * this function will include every relations with worksheet detail for processing VAS
 *
 * @param {EntityManager} trxMgr
 * @param {Domain} domain
 * @param {String} name
 */
export async function getWorksheetDetailByName(
  trxMgr: EntityManager,
  domain: Domain,
  name: string
): Promise<WorksheetDetail> {
  const worksheetDetail: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
    where: { domain, name },
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
  if (!worksheetDetail) throw new Error(`Couldn't find target worksheet detail`)
  if (!worksheetDetail.targetVas) throw new Error(`Couldn't find target vas`)
  return worksheetDetail
}

/**
 * @description Update every related order vas to share same operationGuide data
 *
 * @param {EntityManager} trxMgr
 * @param {Domain} domain
 * @param {Bizplace} bizplace
 * @param {WorksheetDetail} wsd
 * @param {OrderVas} targetVas
 * @param {OperationGuideInterface<T>} operationGuide
 * @param {User} user
 */
export async function updateRelatedOrderVas<T>(
  trxMgr: EntityManager,
  domain: Domain,
  bizplace: Bizplace,
  wsd: WorksheetDetail,
  targetVas: OrderVas,
  operationGuide: OperationGuideInterface<T>,
  user: User
): Promise<OrderVas> {
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
 * @description Return current amount of pallet
 * @param {PalletChangesInterface[]} palletChanges
 * @param {String} palletId
 */
export function getCurrentAmount(
  palletChanges: PalletChangesInterface[],
  palletId: string
): { qty: number; weight: number } {
  return palletChanges
    .filter((pc: PalletChangesInterface) => pc.toPalletId === palletId)
    .reduce(
      (currentAmount: { qty: number; weight: number }, pc: PalletChangesInterface) => {
        return {
          qty: currentAmount.qty + pc.reducedQty,
          weight: currentAmount.weight + pc.reducedWeight
        }
      },
      { qty: 0, weight: 0 }
    )
}

/**
 * @description Return reduced amount of pallet
 * @param {PalletChangesInterface[]} palletChanges
 * @param {String} palletId
 */
export function getReducedAmount(
  palletChanges: PalletChangesInterface[],
  palletId: string
): { reducedQty: number; reducedWeight: number } {
  return palletChanges
    .filter((pc: PalletChangesInterface) => pc.fromPalletId === palletId)
    .reduce(
      (reducedAmount: { reducedQty: number; reducedWeight: number }, pc: PalletChangesInterface) => {
        return {
          reducedQty: reducedAmount.reducedQty + pc.reducedQty || 0,
          reducedWeight: reducedAmount.reducedWeight + pc.reducedWeight || 0
        }
      },
      { reducedQty: 0, reducedWeight: 0 }
    )
}

/**
 * @description Get remain qty of inventory or order inventory (For release good case)
 *
 * @param {EntityManager} trxMgr
 * @param {ArrivalNotice | ReleaseGood | VasOrder} refOrder
 * @param {Domain} domain
 * @param {Bizplace} bizplace
 * @param {Inventory} originInv
 * @param {RepackedInvInfo[]} repackedInvs
 * @param {String} palletId
 */
export async function getRemainInventoryAmount(
  trxMgr: EntityManager,
  refOrder: RefOrderType,
  domain: Domain,
  bizplace: Bizplace,
  originInv: Inventory,
  palletChanges: PalletChangesInterface[],
  palletId: string
): Promise<{ remainQty: number; remainWeight: number }> {
  let remainQty: number = 0
  let remainWeight: number = 0
  const { reducedQty, reducedWeight } = getReducedAmount(palletChanges, palletId)
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

/**
 * @description Assign inventory to targetVas
 * When Vas order comes together with Arrival Notice or Release Good
 * The vas worksheet is activated automatically by to complete unloading/picking worksheet.
 * As a result user can't activate it manually, which means no assignment for every specific vas tasks.
 * For this case inventory should be assigned while processing the VAS Order.
 */
export async function assignInventory(
  trxMgr: EntityManager,
  domain: Domain,
  bizplace: Bizplace,
  user: User,
  wsd: WorksheetDetail,
  refOrder: ArrivalNotice | ReleaseGood,
  targetVas: OrderVas,
  palletId: string
): Promise<OrderVas> {
  let inventory: Inventory

  if (refOrder instanceof ArrivalNotice) {
    // Case 1. When the VAS Order comes with Arrival Notice
    inventory = await trxMgr.getRepository(Inventory).findOne({
      where: {
        domain,
        bizplace,
        palletId,
        status: In([INVENTORY_STATUS.UNLOADED, INVENTORY_STATUS.PUTTING_AWAY]),
        refOrderId: refOrder.id
      }
    })
    if (!inventory) throw new Error(`Counldn't find unloaded inventory by pallet ID: (${palletId})`)

    // Check current inventory has enough qty of product to complete this target vas.
    if (targetVas.qty > inventory.qty) {
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
    pickedOrdInv = pickedOrdInv.find((oi: OrderInventory) => oi.inventory.palletId === palletId)
    inventory = pickedOrdInv?.inventory
    if (!inventory) throw new Error(`Couldn't find picked inventory by pallet ID: ${palletId}`)

    // Check current target inventory (picked inventory) has enough qty of product to complete this target vas.
    // And available qty of products also restriced by picking. (Because customer requests do some vas for Release Order)
    if (targetVas.qty > pickedOrdInv.releaseQty) {
      // If it doesn't have enough, Need to create new worksheet detail and target vas without inventory assignment
      // So the user can proceed it with another inventory
      targetVas = await addNewVasTask(targetVas, pickedOrdInv.releaseQty, domain, bizplace, user, trxMgr, wsd)
    }

    targetVas.inventory = inventory
    targetVas.updater = user
    targetVas = await trxMgr.getRepository(OrderVas).save(targetVas)

    return targetVas
  } else {
    throw new Error(`Reference Order (${refOrder.name}) is not expected.`)
  }
}

/**
 * @description Create nw VAS Worksheet Detail & Order Vas
 * Without inventory assignment
 */
export async function addNewVasTask(
  targetVas: OrderVas,
  currentOrderQty: number,
  domain: Domain,
  bizplace: Bizplace,
  user: User,
  trxMgr: EntityManager,
  wsd: WorksheetDetail
): Promise<OrderVas> {
  // Create new order vas & worksheet detail
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
