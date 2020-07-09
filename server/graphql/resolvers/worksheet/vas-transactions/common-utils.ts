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
import {
  Inventory,
  InventoryNoGenerator,
  INVENTORY_STATUS,
  INVENTORY_TRANSACTION_TYPE,
  Location,
  Pallet,
  Warehouse
} from '@things-factory/warehouse-base'
import { EntityManager, Equal, In, IsNull, Not } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../../constants'
import { Worksheet, WorksheetDetail } from '../../../../entities'
import { generateInventoryHistory, WorksheetNoGenerator } from '../../../../utils'
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
  if (!worksheetDetail.targetVas)
    throw new Error(`Couldn't find any related target vas, using current worksheet detail`)
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
      targetVas = await addNewVasTask(targetVas, inventory.qty, inventory.weight, domain, bizplace, user, trxMgr, wsd)
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
      targetVas = await addNewVasTask(
        targetVas,
        pickedOrdInv.releaseQty,
        pickedOrdInv.releaseWeight,
        domain,
        bizplace,
        user,
        trxMgr,
        wsd
      )
    }
  } else {
    throw new Error(`Reference Order (${refOrder.name}) is not expected.`)
  }

  targetVas.inventory = inventory
  targetVas.updater = user
  return await trxMgr.getRepository(OrderVas).save(targetVas)
}

/**
 * Dismiss assigne inventory when user click undo to remove
 * proceed pallet for relabel, repack, repack
 *
 * @param {EntityManager} trxMgr
 * @param {WorksheetDetail} wsd
 * @param {OrderVas} targetVas
 * @param {PalletChangesInterface[]} palletChanges
 * @param {String} palletId
 */
export async function dismissInventory(
  trxMgr: EntityManager,
  wsd: WorksheetDetail,
  targetVas: OrderVas,
  palletChanges: PalletChangesInterface[],
  palletId: string
) {
  // If there's no more item assigned with current from pallet id
  if (!palletChanges.find((rf: PalletChangesInterface) => rf.fromPalletId === palletId)) {
    targetVas.inventory = null
    const worksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne(wsd.worksheet.id, {
      relations: [
        'worksheetDetails',
        'worksheetDetails.targetVas',
        'worksheetDetails.targetVas.vas',
        'worksheetDetails.targetVas.inventory'
      ]
    })

    const nonFinishedWSD: WorksheetDetail = worksheet.worksheetDetails.find(
      (otherWSD: WorksheetDetail) =>
        otherWSD.id !== wsd.id &&
        otherWSD.targetVas.set === wsd.targetVas.set &&
        otherWSD.targetVas.vas.id === wsd.targetVas.vas.id &&
        otherWSD.status !== WORKSHEET_STATUS.DONE
    )

    if (nonFinishedWSD) {
      // If there non finished same VAS, delete undo target record (worksheet detail & order vas)
      // Add qty and weight for non finished vas task
      await trxMgr.getRepository(WorksheetDetail).delete(wsd.id)
      await trxMgr.getRepository(OrderVas).delete(targetVas.id)

      nonFinishedWSD.targetVas.qty += targetVas.qty
      nonFinishedWSD.targetVas.weight += targetVas.weight
      await trxMgr.getRepository(OrderVas).save(nonFinishedWSD.targetVas)
    } else {
      // If there no non finished same VAS, dismiss inventory for the record
      targetVas.inventory = null
      await trxMgr.getRepository(OrderVas).save(wsd.targetVas)
    }
  }
}

/**
 * @description Create nw VAS Worksheet Detail & Order Vas
 * Without inventory assignment
 */
export async function addNewVasTask(
  targetVas: OrderVas,
  currentOrderQty: number,
  currentOrderWeight: number,
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
    weight: targetVas.weight - currentOrderWeight,
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
  targetVas.weight = currentOrderWeight
  return targetVas
}

export async function upsertInventory(
  trxMgr: EntityManager,
  domain: Domain,
  bizplace: Bizplace,
  user: User,
  originInv: Inventory,
  refOrder: RefOrderType,
  palletId: string,
  locationName: string,
  packingType: string,
  addedQty: number,
  addedWeight: number,
  transactionType: string
): Promise<Inventory> {
  const location: Location = await trxMgr.getRepository(Location).findOne({
    where: { domain, name: locationName },
    relations: ['warehouse']
  })
  if (!location) throw new Error(`Location is not found by (${locationName})`)
  const warehouse: Warehouse = location.warehouse
  const zone: string = location.zone

  let inv: Inventory = await trxMgr.getRepository(Inventory).findOne({
    where: {
      domain,
      bizplace,
      palletId,
      batchId: originInv.batchId,
      product: originInv.product,
      packingType,
      refOrderId: originInv.refOrderId,
      status: Not(Equal(INVENTORY_STATUS.TERMINATED))
    },
    relations: ['product', 'refInventory']
  })

  // Create new inventory
  if (!inv) {
    const copiedInv: Inventory = Object.assign({}, originInv)
    delete copiedInv.id

    inv = {
      ...copiedInv,
      domain,
      bizplace,
      palletId,
      name: InventoryNoGenerator.inventoryName(),
      packingType,
      qty: addedQty,
      weight: addedWeight,
      warehouse,
      location,
      zone,
      creator: user,
      updater: user
    }

    // Save changed inventory
    inv = await trxMgr.getRepository(Inventory).save(inv)

    // Check whether the pallet is resuable or not
    const pallet: Pallet = await trxMgr.getRepository(Pallet).findOne({
      where: { domain, name: palletId, inventory: IsNull() }
    })
    // If it's exists => it's reusable pallet and need to update it's inventory field
    if (pallet) {
      pallet.inventory = inv
      pallet.updater = user
      await trxMgr.getRepository(Pallet).save(pallet)
    }
  } else {
    // Update inventory
    inv.qty += addedQty
    inv.weight += addedWeight
    inv.warehouse = warehouse
    inv.location = location
    inv.zone = location.zone
    inv.updater = user

    // Save changed inventory
    inv = await trxMgr.getRepository(Inventory).save(inv)
  }

  // Create inventory history
  await generateInventoryHistory(inv, refOrder, transactionType, addedQty, addedWeight, user, trxMgr)

  return inv
}

export async function deductProductAmount(
  trxMgr: EntityManager,
  domain: Domain,
  bizplace: Bizplace,
  user: User,
  refOrder: RefOrderType,
  originInv: Inventory,
  reducedQty: number,
  reducedWeight: number,
  transactionType: string
) {
  if (refOrder instanceof ReleaseGood) {
    const loadingWS: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
      where: { domain, bizplace, releaseGood: refOrder, type: WORKSHEET_TYPE.LOADING },
      relations: ['worksheetDetails', 'worksheetDetails.targetInventory', 'worksheetDetails.targetInventory.inventory']
    })

    if (!loadingWS)
      throw new Error(
        `Picking process is not finished yet. Please complete picking first before complete Repalletizing`
      )

    const orderInv: OrderInventory = loadingWS.worksheetDetails
      .map((wsd: WorksheetDetail) => wsd.targetInventory)
      .find((oi: OrderInventory) => oi.inventory.id === originInv.id)
    if (!orderInv) {
      throw new Error(`Failed to find order inventory (Pallet ID: ${originInv.palletId})`)
    }

    orderInv.releaseQty -= reducedQty
    orderInv.releaseWeight -= reducedWeight
    orderInv.updater = user

    await trxMgr.getRepository(OrderInventory).save(orderInv)
  } else {
    originInv.qty -= reducedQty
    originInv.weight -= reducedWeight
    originInv.updater = user
    originInv.status = originInv.qty <= 0 || originInv.weight <= 0 ? INVENTORY_STATUS.TERMINATED : originInv.status

    originInv = await trxMgr.getRepository(Inventory).save(originInv)
    await generateInventoryHistory(originInv, refOrder, transactionType, -reducedQty, -reducedWeight, user, trxMgr)
  }
  return originInv
}

export async function createPutawayWorksheet(
  trxMgr: EntityManager,
  domain: Domain,
  bizplace: Bizplace,
  user: User,
  refOrder: ArrivalNotice,
  originInv: Inventory,
  changedInv: Inventory
): Promise<void> {
  const putawayWS: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
    where: { domain, bizplace, arrivalNotice: refOrder, type: WORKSHEET_TYPE.PUTAWAY },
    relations: ['worksheetDetails', 'worksheetDetails.targetInventory', 'worksheetDetails.targetInventory.inventory']
  })

  if (!putawayWS) {
    throw new Error(
      `Unloading process is not finished yet. Please complete unloading first before complete Repalletizing`
    )
  }
  const putawayWSDs: WorksheetDetail[] = putawayWS.worksheetDetails

  const originalWSD: WorksheetDetail = putawayWSDs.find(
    (wsd: WorksheetDetail) => wsd.targetInventory.inventory.id === originInv.id
  )
  const originOrdInv: OrderInventory = originalWSD.targetInventory
  const sameTargetWSD: WorksheetDetail = putawayWSDs.find(
    (wsd: WorksheetDetail) => wsd.targetInventory.inventory.id === changedInv.id
  )

  if (!sameTargetWSD) {
    // Create new order inventory
    const copiedOrdInv: OrderInventory = Object.assign({}, originOrdInv)
    delete copiedOrdInv.id

    let newOrdInv: OrderInventory = {
      ...copiedOrdInv,
      domain,
      bizplace,
      name: OrderNoGenerator.orderInventory(),
      type: ORDER_TYPES.ARRIVAL_NOTICE,
      arrivalNotice: refOrder,
      inventory: changedInv,
      creator: user,
      updater: user
    }
    newOrdInv = await trxMgr.getRepository(OrderInventory).save(newOrdInv)

    const copiedWSD: WorksheetDetail = Object.assign({}, originalWSD)
    delete copiedWSD.id

    let newWSD: WorksheetDetail = {
      ...copiedWSD,
      domain,
      bizplace,
      worksheet: putawayWS,
      name: WorksheetNoGenerator.putawayDetail(),
      targetInventory: newOrdInv,
      type: WORKSHEET_TYPE.PUTAWAY,
      creator: user,
      updater: user
    }
    newWSD = await trxMgr.getRepository(WorksheetDetail).save(newWSD)
  }

  // Update origin order inventory
  if (originInv.status === INVENTORY_STATUS.TERMINATED) {
    await trxMgr.getRepository(WorksheetDetail).delete(originalWSD.id)

    originOrdInv.status = ORDER_INVENTORY_STATUS.DONE
    originOrdInv.updater = user
    await trxMgr.getRepository(OrderInventory).save(originOrdInv)
  }
}

export async function createLoadingWorksheet(
  trxMgr: EntityManager,
  domain: Domain,
  bizplace: Bizplace,
  user: User,
  refOrder: ReleaseGood,
  originInv: OrderInventory,
  changedInv: Inventory
): Promise<void> {
  const changedQty: number = changedInv.qty
  const changedWeight: number = changedInv.weight
  const loadingWS: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
    where: { domain, bizplace, releaseGood: refOrder, type: WORKSHEET_TYPE.LOADING },
    relations: ['worksheetDetails', 'worksheetDetails.targetInventory', 'worksheetDetails.targetInventory.inventory']
  })

  if (!loadingWS) {
    throw new Error(`Picking process is not finished yet. Please complete picking first before complete Repalletizing`)
  }

  const loadingWSDs: WorksheetDetail[] = loadingWS.worksheetDetails

  const originalWSD: WorksheetDetail = loadingWSDs.find(
    (wsd: WorksheetDetail) => wsd.targetInventory.inventory.id === originInv.id
  )
  const originOrdInv: OrderInventory = originalWSD.targetInventory
  const sameTargetWSD: WorksheetDetail = loadingWSDs.find((wsd: WorksheetDetail) => {
    const targetOI: OrderInventory = wsd.targetInventory
    const targetInv: Inventory = targetOI.inventory
    const targetUnitWeight: number = targetOI.releaseWeight / targetOI.releaseQty
    const changeUnitWeight: number = changedWeight / changedQty

    if (
      targetInv.palletId === changedInv.palletId &&
      targetInv.batchId === changedInv.batchId &&
      targetInv.packingType === changedInv.packingType &&
      targetUnitWeight === changeUnitWeight
    ) {
      return wsd
    }
  })

  if (!sameTargetWSD) {
    // Create new order inventory
    const copiedOrderInv: OrderInventory = Object.assign({}, originOrdInv)
    delete copiedOrderInv.id

    let newOrdInv: OrderInventory = await trxMgr.getRepository(OrderInventory).save({
      ...copiedOrderInv,
      domain,
      bizplace,
      releaseQty: changedQty,
      releaseWeight: changedWeight,
      name: OrderNoGenerator.orderInventory(),
      type: ORDER_TYPES.RELEASE_OF_GOODS,
      releaseGood: refOrder,
      inventory: changedInv,
      creator: user,
      updater: user
    })
    newOrdInv = await trxMgr.getRepository(OrderInventory).save(newOrdInv)

    const copiedWSD: WorksheetDetail = Object.assign({}, originalWSD)
    delete copiedWSD.id

    let newWSD: WorksheetDetail = {
      ...copiedWSD,
      domain,
      bizplace,
      worksheet: loadingWS,
      name: WorksheetNoGenerator.loadingDetail(),
      targetInventory: newOrdInv,
      type: WORKSHEET_TYPE.LOADING,
      creator: user,
      updater: user
    }
    await trxMgr.getRepository(WorksheetDetail).save(newWSD)
  } else {
    let sameTargetInv: OrderInventory = sameTargetWSD.targetInventory
    sameTargetInv.releaseQty += changedQty
    sameTargetInv.releaseWeight += changedWeight
    sameTargetInv.updater = user
    await trxMgr.getRepository(OrderInventory).save(sameTargetInv)
  }

  // Update inventory to PICKED inventory
  changedInv = await trxMgr.getRepository(Inventory).save({
    ...changedInv,
    qty: changedInv.qty - changedQty,
    weight: changedInv.weight - changedWeight,
    updater: user
  })

  // Generate PICKING inventory history
  await generateInventoryHistory(
    changedInv,
    refOrder,
    INVENTORY_TRANSACTION_TYPE.PICKING,
    -changedQty,
    -changedWeight,
    user,
    trxMgr
  )

  // Generate TERMINATED inventory history
  await generateInventoryHistory(changedInv, refOrder, INVENTORY_TRANSACTION_TYPE.TERMINATED, 0, 0, user, trxMgr)

  // Delete worksheet detail & order inventory
  // If order inventory doesn't have release qty any more
  if (originOrdInv.releaseQty <= 0) {
    await trxMgr.getRepository(WorksheetDetail).delete(originalWSD.id)
    originInv.status = ORDER_INVENTORY_STATUS.DONE
    originInv.updater = user
    await trxMgr.getRepository(OrderInventory).save(originInv)
  }
}
