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
  Warehouse
} from '@things-factory/warehouse-base'
import { EntityManager, Not } from 'typeorm'
import { WORKSHEET_TYPE } from '../../../../../constants'
import { Worksheet, WorksheetDetail } from '../../../../../entities'
import { generateInventoryHistory, WorksheetNoGenerator } from '../../../../../utils'
import {
  OperationGuideInterface,
  PackingUnits,
  RefOrderType,
  RepackagingGuide,
  RepackedFrom,
  RepackedInvInfo
} from '../intefaces'

export async function completeRepackaging(trxMgr: EntityManager, orderVas: OrderVas, user: User): Promise<void> {
  orderVas = await trxMgr.getRepository(OrderVas).findOne(orderVas.id, {
    relations: [
      'domain',
      'bizplace',
      'inventory',
      'inventory.product',
      'arrivalNotice',
      'releaseGood',
      'shippingOrder',
      'vasOrder'
    ]
  })
  const domain: Domain = orderVas.domain
  const bizplace: Bizplace = orderVas.bizplace
  let originInv: Inventory = orderVas.inventory
  const operationGuide: OperationGuideInterface<RepackagingGuide> = JSON.parse(orderVas.operationGuide)
  const operationGuideData: RepackagingGuide = operationGuide.data
  const packingUnit: string = operationGuideData.packingUnit
  const stdAmount: number = operationGuideData.stdAmount
  const toPackingType: string = operationGuideData.toPackingType
  const repackedInvs: RepackedInvInfo[] = extractRepackedInvs(operationGuideData, originInv)

  let refOrder: RefOrderType
  if (orderVas.arrivalNotice) {
    refOrder = orderVas.arrivalNotice
  } else if (orderVas.releaseGood) {
    refOrder = orderVas.releaseGood
  } else if (orderVas.shippingOrder) {
    refOrder = orderVas.shippingOrder
  } else if (orderVas.vasOrder) {
    refOrder = orderVas.vasOrder
  }

  // create repacked inventories based on repackedInvs
  for (const ri of repackedInvs) {
    const repackedFromList: RepackedFrom[] = ri.repackedFrom.filter((rf: RepackedFrom) => rf.toPalletId === ri.palletId)
    const { reducedQty, reducedWeight } = getReducedAmount(repackedFromList)
    const repackedPkgQty: number = packingUnit === PackingUnits.QTY ? reducedQty / stdAmount : reducedWeight / stdAmount
    const changedInv: Inventory = await upsertInventory(
      trxMgr,
      domain,
      bizplace,
      user,
      originInv,
      refOrder,
      ri,
      toPackingType,
      repackedPkgQty,
      reducedWeight
    )

    // Deduct amount of product on original pallet or order inventory (Case for release order)
    if (refOrder instanceof ReleaseGood) {
      throw new Error('TODO: Deduction amount of product for Release Goods Case')
    } else {
      originInv.qty -= reducedQty
      originInv.weight -= reducedWeight
      originInv.updater = user
      originInv.status = originInv.qty <= 0 || originInv.weight <= 0 ? INVENTORY_STATUS.TERMINATED : originInv.status

      originInv = await trxMgr.getRepository(Inventory).save(originInv)
      await generateInventoryHistory(
        originInv,
        refOrder,
        INVENTORY_TRANSACTION_TYPE.REPACKAGING,
        -reducedQty,
        -reducedWeight,
        user,
        trxMgr
      )
    }

    // Create worksheet if it's related with Arrival Notice or Release Order
    if (refOrder instanceof ArrivalNotice) {
      await createPutawayWorksheet(trxMgr, domain, bizplace, refOrder, originInv, changedInv, user)
    } else if (refOrder instanceof ReleaseGood) {
      await createLoadingWorksheet(trxMgr, domain, bizplace, refOrder, originInv, changedInv, user)
    }
  }
}

async function upsertInventory(
  trxMgr: EntityManager,
  domain: Domain,
  bizplace: any,
  user: any,
  originInv: any,
  refOrder: any,
  ri: RepackedInvInfo,
  toPackingType: string,
  addedQty: number,
  addedWeight: number
): Promise<Inventory> {
  const location: Location = await trxMgr.getRepository(Location).findOne({
    where: { domain, name: ri.locationName },
    relations: ['warehouse']
  })
  if (!location) throw new Error(`Location not found by (${ri.locationName})`)
  const warehouse: Warehouse = location.warehouse
  const zone: string = location.zone

  let inv: Inventory = await trxMgr.getRepository(Inventory).findOne({
    where: {
      domain,
      bizplace,
      palletId: ri.palletId,
      batchId: originInv.batchId,
      product: originInv.product,
      packingType: toPackingType,
      status: Not(INVENTORY_STATUS.TERMINATED)
    }
  })

  // Create new inventory
  if (!inv) {
    inv = {
      domain,
      bizplace,
      palletId: ri.palletId,
      batchId: originInv.batchId,
      name: InventoryNoGenerator.inventoryName(),
      product: originInv.product,
      packingType: toPackingType,
      qty: addedQty,
      weight: addedWeight,
      refOrderId: originInv.refOrderId,
      warehouse,
      location,
      zone,
      status: originInv.status,
      orderProductId: originInv.orderProductId,
      creator: user,
      updater: user
    }
  } else {
    // Update inventory
    inv.qty += addedQty
    inv.weight += addedWeight
    inv.warehouse = warehouse
    inv.location = location
    inv.zone = location.zone
    inv.updater = user
  }

  // Save changed inventory
  inv = await trxMgr.getRepository(Inventory).save(inv)
  // Create inventory history
  await generateInventoryHistory(
    inv,
    refOrder,
    INVENTORY_TRANSACTION_TYPE.REPACKAGING,
    addedQty,
    addedWeight,
    user,
    trxMgr
  )

  return inv
}

function getReducedAmount(repackedFromList: RepackedFrom[]): { reducedQty: number; reducedWeight: number } {
  return repackedFromList.reduce(
    (reducedAmount: { reducedQty: number; reducedWeight: number }, rf: RepackedFrom) => {
      return {
        reducedQty: reducedAmount.reducedQty + rf.reducedQty,
        reducedWeight: reducedAmount.reducedWeight + rf.reducedWeight
      }
    },
    { reducedQty: 0, reducedWeight: 0 }
  )
}

function extractRepackedInvs(operationGuideData: RepackagingGuide, originInv: Inventory): RepackedInvInfo[] {
  return operationGuideData.repackedInvs
    .filter((repackedInv: RepackedInvInfo) => {
      const isPalletIncluded: boolean = Boolean(
        repackedInv.repackedFrom.find((rf: RepackedFrom) => rf.fromPalletId === originInv.palletId)
      )
      if (isPalletIncluded) return repackedInv
    })
    .map((ri: RepackedInvInfo) => {
      ri.repackedFrom = ri.repackedFrom.filter((rf: RepackedFrom) => rf.fromPalletId === originInv.palletId)
      return ri
    })
}

async function createPutawayWorksheet(
  trxMgr: EntityManager,
  domain: Domain,
  bizplace: Bizplace,
  refOrder: ArrivalNotice,
  originInv: Inventory,
  changedInv: Inventory,
  user: User
): Promise<void> {
  const originWS: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
    where: { domain, bizplace, arrivalNotice: refOrder, type: WORKSHEET_TYPE.PUTAWAY },
    relations: ['worksheetDetails', 'worksheetDetails.targetInventory', 'worksheetDetails.targetInventory.inventory']
  })

  if (!originWS) {
    throw new Error(
      `Unloading process is not finished yet. Please complete unloading first before complete Repalletizing`
    )
  }

  const originWSD: WorksheetDetail = originWS.worksheetDetails.find(
    (wsd: WorksheetDetail) => wsd.targetInventory.inventory.id === originInv.id
  )
  const originOrdInv: OrderInventory = originWSD.targetInventory

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

  const copiedWSD: WorksheetDetail = Object.assign({}, originWSD)
  delete copiedWSD.id

  let newWSD: WorksheetDetail = {
    ...copiedWSD,
    domain,
    bizplace,
    worksheet: originWS,
    name: WorksheetNoGenerator.putawayDetail(),
    targetInventory: newOrdInv,
    type: WORKSHEET_TYPE.PUTAWAY,
    creator: user,
    updater: user
  }
  newWSD = await trxMgr.getRepository(WorksheetDetail).save(newWSD)

  // Update origin order inventory
  if (originInv.status === INVENTORY_STATUS.TERMINATED) {
    await trxMgr.getRepository(WorksheetDetail).delete(originWSD.id)

    originOrdInv.status = ORDER_INVENTORY_STATUS.DONE
    originOrdInv.updater = user
    await trxMgr.getRepository(OrderInventory).save(originOrdInv)
  }
}

async function createLoadingWorksheet(
  trxMgr: EntityManager,
  domain: Domain,
  bizplace: Bizplace,
  refOrder: ReleaseGood,
  originInv: OrderInventory,
  inv: Inventory,
  user: User
): Promise<void> {
  const changedQty: number = inv.qty
  const changedWeight: number = inv.weight
  const loadingWS: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
    where: { domain, bizplace, releaseGood: refOrder, type: WORKSHEET_TYPE.LOADING },
    relations: ['worksheetDetails', 'worksheetDetails.targetInventory', 'worksheetDetails.targetInventory.inventory']
  })

  if (!loadingWS)
    throw new Error(`Picking process is not finished yet. Please complete picking first before complete Repalletizing`)

  const loadingWSD: WorksheetDetail = loadingWS.worksheetDetails.find(
    (wsd: WorksheetDetail) => wsd.targetInventory.inventory.id === originInv.id
  )

  let loadingOrdInv: OrderInventory = loadingWSD.targetInventory
  // Create new order inventory
  const copiedOrderInv: OrderInventory = Object.assign({}, loadingOrdInv)
  delete copiedOrderInv.id

  const newOrderInv: OrderInventory = await trxMgr.getRepository(OrderInventory).save({
    ...copiedOrderInv,
    domain,
    bizplace,
    releaseQty: changedQty,
    releaseWeight: changedWeight,
    name: OrderNoGenerator.orderInventory(),
    type: ORDER_TYPES.RELEASE_OF_GOODS,
    releaseGood: refOrder,
    inventory: inv,
    creator: user,
    updater: user
  })

  const copiedWSD: WorksheetDetail = Object.assign({}, loadingWSD)
  delete copiedWSD.id
  await trxMgr.getRepository(WorksheetDetail).save({
    ...copiedWSD,
    domain,
    bizplace,
    worksheet: loadingWS,
    name: WorksheetNoGenerator.loadingDetail(),
    targetInventory: newOrderInv,
    type: WORKSHEET_TYPE.LOADING,
    creator: user,
    updater: user
  })

  // Deduct qty of loading order inventory
  loadingOrdInv.releaseQty = loadingOrdInv.releaseQty - changedQty
  loadingOrdInv.releaseWeight = loadingOrdInv.releaseWeight - changedWeight
  loadingOrdInv.updater = user
  loadingOrdInv = await trxMgr.getRepository(OrderInventory).save(loadingOrdInv)

  // Update inventory to PICKED inventory
  inv = await trxMgr.getRepository(Inventory).save({
    ...inv,
    qty: 0,
    weight: 0,
    updater: user
  })

  // Generate PICKING inventory history
  await generateInventoryHistory(
    inv,
    refOrder,
    INVENTORY_TRANSACTION_TYPE.PICKING,
    -changedQty,
    -changedWeight,
    user,
    trxMgr
  )

  // Generate TERMINATED inventory history
  await generateInventoryHistory(inv, refOrder, INVENTORY_TRANSACTION_TYPE.TERMINATED, 0, 0, user, trxMgr)

  // Delete worksheet detail & order inventory
  // If order inventory doesn't have release qty any more
  if (loadingOrdInv.releaseQty <= 0) {
    await trxMgr.getRepository(WorksheetDetail).delete(loadingWSD.id)
    await trxMgr.getRepository(OrderInventory).save({
      ...loadingOrdInv,
      status: ORDER_INVENTORY_STATUS.DONE,
      updater: user
    })
  }
}

async function terminateEmptyInventory(
  trxMgr: EntityManager,
  refOrder: RefOrderType,
  inventory: Inventory,
  user: User
): Promise<void> {
  if (refOrder instanceof ReleaseGood) {
    console.log('Terminate empty inventory')
  } else {
    inventory = await trxMgr.getRepository(Inventory).save({
      ...inventory,
      status: INVENTORY_STATUS.TERMINATED,
      updater: user
    })

    await generateInventoryHistory(inventory, refOrder, INVENTORY_TRANSACTION_TYPE.REPACKAGING, 0, 0, user, trxMgr)
  }
}

async function deductInventoryQty(
  trxMgr: EntityManager,
  refOrder: RefOrderType,
  originInv: Inventory,
  reducedQty: number,
  reducedWeight: number,
  user: User
): Promise<Inventory> {
  if (refOrder instanceof ReleaseGood) {
    return originInv
  } else {
    originInv = await trxMgr.getRepository(Inventory).save({
      ...originInv,
      qty: originInv.qty - reducedQty,
      weight: originInv.weight - reducedWeight,
      updater: user
    })

    await generateInventoryHistory(
      originInv,
      refOrder,
      INVENTORY_TRANSACTION_TYPE.REPACKAGING,
      -reducedQty,
      -reducedWeight,
      user,
      trxMgr
    )
  }

  return originInv
}

async function updateInv(
  refOrder: RefOrderType,
  trxMgr: EntityManager,
  domain: Domain,
  inv: Inventory,
  addedQty: number,
  addedWeight: number,
  locationName: string,
  user: User
): Promise<Inventory> {
  const location: Location = await trxMgr.getRepository(Location).findOne({
    where: { domain, name: locationName },
    relations: ['warehouse']
  })
  const warehouse: Warehouse = location.warehouse
  const zone: string = location.zone

  if (!(refOrder instanceof ReleaseGood)) {
    // Add qty and weight
    inv = await trxMgr.getRepository(Inventory).save({
      ...inv,
      qty: inv.qty + addedQty,
      weight: inv.weight + addedWeight,
      location,
      warehouse,
      zone,
      updater: user
    })
  }

  return inv
}

async function createInv(
  refOrder: RefOrderType,
  trxMgr: EntityManager,
  domain: Domain,
  bizplace: Bizplace,
  palletId: string,
  originInv: Inventory,
  addedQty: number,
  addedWeight: number,
  locationName: Location,
  user: User
): Promise<Inventory> {
  const location: Location = await trxMgr.getRepository(Location).findOne({
    where: { domain, name: locationName },
    relations: ['warehouse']
  })
  const warehouse: Warehouse = location.warehouse
  const zone: string = location.zone

  const newInv: Inventory = await trxMgr.getRepository(Inventory).save({
    domain,
    bizplace,
    palletId,
    batchId: originInv.batchId,
    name: InventoryNoGenerator.inventoryName(),
    product: originInv.product,
    packingType: originInv.packingType,
    qty: addedQty,
    weight: addedWeight,
    refOrderId: originInv.refOrderId,
    warehouse,
    location,
    zone,
    status: originInv.status,
    orderProductId: originInv.orderProductId,
    creator: user,
    updater: user
  })

  // Create inventory history
  await generateInventoryHistory(
    newInv,
    refOrder,
    INVENTORY_TRANSACTION_TYPE.REPACKAGING,
    addedQty,
    addedWeight,
    user,
    trxMgr
  )

  return newInv
}

async function getUnitWeight(
  refOrder: RefOrderType,
  trxMgr: EntityManager,
  domain: Domain,
  bizplace: Bizplace,
  originInv: Inventory
): Promise<number> {
  let unitWeight: number

  if (refOrder instanceof ReleaseGood) {
    // Find loading order inventory to figure out unit weight
    const orderInv: OrderInventory = await trxMgr.getRepository(OrderInventory).findOne({
      where: { domain, bizplace, inventory: originInv, releaseGood: refOrder, type: ORDER_TYPES.RELEASE_OF_GOODS }
    })
    unitWeight = orderInv.releaseWeight / orderInv.releaseQty
  } else {
    unitWeight = originInv.weight / originInv.qty
  }
  return unitWeight
}
