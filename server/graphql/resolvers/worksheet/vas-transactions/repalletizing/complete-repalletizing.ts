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
  PalletChangesInterface,
  RefOrderType,
  RepalletizedInvInfo,
  RepalletizingGuide
} from '../intefaces'

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
  const stdQty: number = operationGuideData.stdQty
  const repalletizedInvs: RepalletizedInvInfo[] = extractRepackedInvs(operationGuideData, originInv)

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

  // create repalletized inventories based on repalletizedInvs
  for (const ri of repalletizedInvs) {
    const repalletizedFromList: PalletChangesInterface[] = ri.repalletizedFrom.filter(
      (rf: PalletChangesInterface) => rf.toPalletId === ri.palletId
    )
    const { reducedQty, reducedWeight } = getReducedAmount(repalletizedFromList)
    const changedInv: Inventory = await upsertInventory(
      trxMgr,
      domain,
      bizplace,
      user,
      originInv,
      refOrder,
      ri,
      reducedQty,
      reducedWeight
    )

    // Deduct amount of product on original pallet or order inventory (Case for release order)
    if (refOrder instanceof ReleaseGood) {
      const loadingWS: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
        where: { domain, bizplace, releaseGood: refOrder, type: WORKSHEET_TYPE.LOADING },
        relations: [
          'worksheetDetails',
          'worksheetDetails.targetInventory',
          'worksheetDetails.targetInventory.inventory'
        ]
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
  ri: RepalletizedInvInfo,
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
      packingType: originInv.packingType,
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
    INVENTORY_TRANSACTION_TYPE.REPALLETIZING,
    addedQty,
    addedWeight,
    user,
    trxMgr
  )

  return inv
}

function getReducedAmount(repackedFromList: PalletChangesInterface[]): { reducedQty: number; reducedWeight: number } {
  return repackedFromList.reduce(
    (reducedAmount: { reducedQty: number; reducedWeight: number }, rf: PalletChangesInterface) => {
      return {
        reducedQty: reducedAmount.reducedQty + rf.reducedQty,
        reducedWeight: reducedAmount.reducedWeight + rf.reducedWeight
      }
    },
    { reducedQty: 0, reducedWeight: 0 }
  )
}

function extractRepackedInvs(operationGuideData: RepalletizingGuide, originInv: Inventory): RepalletizedInvInfo[] {
  return operationGuideData.repalletizedInvs
    .filter((ri: RepalletizedInvInfo) => {
      const isPalletIncluded: boolean = Boolean(
        ri.repalletizedFrom.find((rf: PalletChangesInterface) => rf.fromPalletId === originInv.palletId)
      )
      if (isPalletIncluded) return ri
    })
    .map((ri: RepalletizedInvInfo) => {
      ri.repalletizedFrom = ri.repalletizedFrom.filter(
        (rf: PalletChangesInterface) => rf.fromPalletId === originInv.palletId
      )
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
  const originPutawayWS: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
    where: { domain, bizplace, arrivalNotice: refOrder, type: WORKSHEET_TYPE.PUTAWAY },
    relations: ['worksheetDetails', 'worksheetDetails.targetInventory', 'worksheetDetails.targetInventory.inventory']
  })

  if (!originPutawayWS) {
    throw new Error(
      `Unloading process is not finished yet. Please complete unloading first before complete Repalletizing`
    )
  }

  const originPutawayWSD: WorksheetDetail = originPutawayWS.worksheetDetails.find(
    (wsd: WorksheetDetail) => wsd.targetInventory.inventory.id === originInv.id
  )
  const originOrdInv: OrderInventory = originPutawayWSD.targetInventory

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

  const copiedWSD: WorksheetDetail = Object.assign({}, originPutawayWSD)
  delete copiedWSD.id

  let newWSD: WorksheetDetail = {
    ...copiedWSD,
    domain,
    bizplace,
    worksheet: originPutawayWS,
    name: WorksheetNoGenerator.putawayDetail(),
    targetInventory: newOrdInv,
    type: WORKSHEET_TYPE.PUTAWAY,
    creator: user,
    updater: user
  }
  newWSD = await trxMgr.getRepository(WorksheetDetail).save(newWSD)

  // Update origin order inventory
  if (originInv.status === INVENTORY_STATUS.TERMINATED) {
    await trxMgr.getRepository(WorksheetDetail).delete(originPutawayWSD.id)

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
    originInv.status = ORDER_INVENTORY_STATUS.DONE
    originInv.updater = user
    await trxMgr.getRepository(OrderInventory).save(originInv)
  }
}
