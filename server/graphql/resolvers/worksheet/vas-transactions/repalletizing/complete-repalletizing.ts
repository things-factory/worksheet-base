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
import { EntityManager } from 'typeorm'
import { WORKSHEET_TYPE } from '../../../../../constants'
import { Worksheet, WorksheetDetail } from '../../../../../entities'
import { generateInventoryHistory, WorksheetNoGenerator } from '../../../../../utils'
import { OperationGuideInterface, RefOrderType, RepalletizedInvInfo, RepalletizingGuide } from '../intefaces'

export async function completeRepalletizing(trxMgr: EntityManager, orderVas: OrderVas, user: User): Promise<void> {
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
  const operationGuide: OperationGuideInterface<RepalletizingGuide> = JSON.parse(orderVas.operationGuide)
  const operationGuideData: RepalletizingGuide = operationGuide.data

  const repalletizedInvs: RepalletizedInvInfo[] = operationGuideData.repalletizedInvs

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

  for (let repalletizedInv of repalletizedInvs) {
    const palletId: string = repalletizedInv.palletId
    const addedQty: number = repalletizedInv.addedQty
    const addedWeight: number = repalletizedInv.addedWeight
    const locationName: string = repalletizedInv.locationName
    // Try to find inventory by pallet ID and domain, bizplace
    let inv: Inventory = await trxMgr.getRepository(Inventory).findOne({
      where: { domain, bizplace, palletId }
    })

    if (inv) {
      // Inventory exists
      inv = await updateInv(refOrder, trxMgr, domain, inv, addedQty, addedWeight, locationName, updateInv)
    } else {
      // Inventory doesn't exists
      inv = await createInv(
        refOrder,
        trxMgr,
        domain,
        bizplace,
        palletId,
        originInv,
        addedQty,
        addedWeight,
        locationName,
        user
      )
    }

    originInv = await deductInventoryQty(trxMgr, refOrder, originInv, addedQty, addedWeight, user)

    if (refOrder instanceof ArrivalNotice) {
      // If current VAS order related with arrival notice
      // Create putaway worksheet and order inventories for putaway task
      await createPutawayWorksheet(trxMgr, domain, bizplace, refOrder, originInv, inv, user)
    } else if (refOrder instanceof ReleaseGood) {
      // If current VAS Order realted with release good
      // Create loading worksheet and order inventories for loading task
      await createLoadingWorksheet(trxMgr, domain, bizplace, refOrder, originInv, inv, user)
    }
  }

  // Check whether original inv has qty or not.
  if (originInv.qty < 0 || originInv.weight < 0) throw new Error('Deducted amount of inventory value is negative')
  if ((originInv.qty == 0 && originInv.weight != 0) || (originInv.weight == 0 && originInv.qty != 0))
    throw new Error('Unbalanced amount of inventory.')

  // If there's no more qty of products => Terminate inventory
  if (originInv.qty == 0 && originInv.weight == 0 && !(refOrder instanceof ReleaseGood)) {
    await terminateEmptyInventory(trxMgr, refOrder, originInv, user)
  }
}

async function createPutawayWorksheet(
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
  const putawayWS: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
    where: { domain, bizplace, arrivalNotice: refOrder, type: WORKSHEET_TYPE.PUTAWAY },
    relations: ['worksheetDetails', 'worksheetDetails.targetInventory', 'worksheetDetails.targetInventory.inventory']
  })

  if (!putawayWS)
    throw new Error(
      `Unloading process is not finished yet. Please complete unloading first before complete Repalletizing`
    )

  const putawayWSD: WorksheetDetail = putawayWS.worksheetDetails.find(
    (wsd: WorksheetDetail) => wsd.targetInventory.inventory.id === originInv.id
  )
  let putawayOrderInv: OrderInventory = putawayWSD.targetInventory

  //Create new order inventory
  const copiedOrderInv: OrderInventory = Object.assign({}, putawayOrderInv)
  delete copiedOrderInv.id

  const newOrderInv: OrderInventory = await trxMgr.getRepository(OrderInventory).save({
    ...copiedOrderInv,
    domain,
    bizplace,
    releaseQty: changedQty,
    releaseWeight: changedWeight,
    name: OrderNoGenerator.orderInventory(),
    type: ORDER_TYPES.ARRIVAL_NOTICE,
    arrivalNotice: refOrder,
    inventory: inv,
    creator: user,
    updater: user
  })

  const copiedWSD: WorksheetDetail = Object.assign({}, putawayWSD)
  delete copiedWSD.id
  await trxMgr.getRepository(WorksheetDetail).save({
    ...copiedWSD,
    domain,
    bizplace,
    worksheet: putawayWS,
    name: WorksheetNoGenerator.putawayDetail(),
    targetInventory: newOrderInv,
    type: WORKSHEET_TYPE.PUTAWAY,
    creator: user,
    updater: user
  })

  // Deduct qty of putaway order inventory
  putawayOrderInv.releaseQty = putawayOrderInv.releaseQty - changedQty
  putawayOrderInv.releaseWeight = putawayOrderInv.releaseWeight - changedWeight
  putawayOrderInv.updater = user
  putawayOrderInv = await trxMgr.getRepository(OrderInventory).save(putawayOrderInv)

  // Delete worksheet detail
  // If there's no more qty of inventory delete worksheet detail which is assigned for the inventory
  // and change status of order inventory
  if (originInv.qty <= 0) {
    await trxMgr.getRepository(WorksheetDetail).delete(putawayWSD.id)
    await trxMgr.getRepository(OrderInventory).save({
      ...putawayOrderInv,
      status: ORDER_INVENTORY_STATUS.DONE,
      updater: user
    })
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
  // If order inventory doesn't have release qty any more change status to DONE
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

    await generateInventoryHistory(inventory, refOrder, INVENTORY_TRANSACTION_TYPE.REPALLETIZING, 0, 0, user, trxMgr)
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
      INVENTORY_TRANSACTION_TYPE.REPALLETIZING,
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
    INVENTORY_TRANSACTION_TYPE.REPALLETIZING,
    addedQty,
    addedWeight,
    user,
    trxMgr
  )

  return newInv
}
