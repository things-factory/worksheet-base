import { Domain } from '@things-factory/shell'
import { User } from '@things-factory/auth-base'
import {
  generateDeliveryOrder,
  OrderInventory,
  OrderNoGenerator,
  ORDER_INVENTORY_STATUS,
  ORDER_STATUS,
  ORDER_TYPES,
  ReleaseGood
} from '@things-factory/sales-base'
import { getManager, In, Not, Equal, EntityManager, getRepository, Repository } from 'typeorm'
import {
  Inventory,
  InventoryHistory,
  INVENTORY_STATUS,
  InventoryNoGenerator,
  INVENTORY_TRANSACTION_TYPE,
  Location,
  LOCATION_STATUS
} from '@things-factory/warehouse-base'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { WorksheetDetail } from '../../../entities'

export const loading = {
  async loading(_: any, { loadedWorksheetDetails, releaseGoodNo, orderInfo }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const releaseGood: ReleaseGood = await trxMgr.getRepository(ReleaseGood).findOne({
        where: { domain: context.state.domain, name: releaseGoodNo, status: ORDER_STATUS.LOADING },
        relations: ['bizplace']
      })

      const wsdNames: string[] = loadedWorksheetDetails.map((wsd: any) => wsd.name)
      const worksheetDetails: WorksheetDetail[] = await trxMgr.getRepository(WorksheetDetail).find({
        where: {
          domain: context.state.domain,
          name: In(wsdNames),
          status: WORKSHEET_STATUS.EXECUTING,
          type: WORKSHEET_TYPE.LOADING
        },
        relations: [
          'worksheet',
          'worksheet.worksheetDetails',
          'targetInventory',
          'targetInventory.domain',
          'targetInventory.bizplace',
          'targetInventory.inventory',
          'targetInventory.releaseGood'
        ]
      })
      let targetInventories: OrderInventory[] = []
      if (wsdNames.length !== worksheetDetails.length) throw new Error(`Can't find some of worksheet details`)

      for (let i = 0; i < worksheetDetails.length; i++) {
        const wsd: WorksheetDetail = worksheetDetails[i]

        const orderInventory: OrderInventory = wsd.targetInventory
        const pickedQty: number = orderInventory.releaseQty
        const loadedQty: number = loadedWorksheetDetails.find((loadedWSD: any) => loadedWSD.name === wsd.name).loadedQty

        if (loadedQty > pickedQty) {
          throw new Error(`Loaded QTY can't excced Picked QTY`)
        } else if (loadedQty == pickedQty) {
          // 1. Change status of current worksheet detail
          // 2. Change status of order inventory
          await trxMgr.getRepository(WorksheetDetail).save({
            ...wsd,
            status: WORKSHEET_STATUS.DONE,
            updater: context.state.user
          })

          const targetInventory: OrderInventory = await trxMgr.getRepository(OrderInventory).save({
            ...orderInventory,
            status: ORDER_INVENTORY_STATUS.LOADED,
            updater: context.state.user
          })
          targetInventories.push(targetInventory)

          await createInventoryHistory(
            context.state.domain,
            releaseGood,
            targetInventory,
            wsd,
            loadedQty,
            context.state.user,
            trxMgr
          )
        } else if (loadedQty < pickedQty) {
          const remainQty: number = pickedQty - loadedQty
          const pickedWeight: number = orderInventory.releaseWeight
          const loadedWeight: number = parseFloat(((pickedWeight / pickedQty) * loadedQty).toFixed(2))
          const remainWeight: number = parseFloat((pickedWeight - loadedWeight).toFixed(2))

          const lastSeq: number = await trxMgr.getRepository(OrderInventory).count({
            where: { releaseGood, type: ORDER_TYPES.RELEASE_OF_GOODS }
          })

          const targetInventory: OrderInventory = await trxMgr.getRepository(OrderInventory).save({
            ...orderInventory,
            status: ORDER_INVENTORY_STATUS.LOADED,
            releaseQty: loadedQty,
            releaseWeight: loadedWeight,
            updater: context.state.user
          })

          targetInventories.push(targetInventory)

          // create inventory history for loaded item
          await createInventoryHistory(
            context.state.domain,
            releaseGood,
            targetInventory,
            wsd,
            loadedQty,
            context.state.user,
            trxMgr
          )

          // Create order inventory for remaining item
          let newOrderInventory: OrderInventory = {
            ...orderInventory,
            name: OrderNoGenerator.orderInventory(),
            status: ORDER_INVENTORY_STATUS.LOADING,
            worksheetDetail: wsd,
            releaseQty: remainQty,
            releaseWeight: remainWeight,
            seq: lastSeq + 1,
            creator: context.state.user,
            updater: context.state.user
          }
          delete newOrderInventory.id

          newOrderInventory = await trxMgr.getRepository(OrderInventory).save(newOrderInventory)
          await trxMgr.getRepository(WorksheetDetail).save({
            ...wsd,
            targetInventory: newOrderInventory,
            updater: context.state.user
          })
        }
      }

      await generateDeliveryOrder(
        orderInfo,
        targetInventories,
        releaseGood.bizplace,
        releaseGood,
        context.state.domain,
        context.state.user,
        trxMgr
      )

      return
    })
  }
}

// Creating inventory history
export async function createInventoryHistory(
  domain: Domain,
  releaseGood: ReleaseGood,
  targetInventory: OrderInventory,
  wsd: WorksheetDetail,
  loadedQty: number,
  user: User,
  trxMgr?: EntityManager
): Promise<void> {
  const inventoryHistoryRepo: Repository<InventoryHistory> = trxMgr
    ? trxMgr.getRepository(InventoryHistory)
    : getRepository(InventoryHistory)
  const inventoryRepo: Repository<Inventory> = trxMgr ? trxMgr.getRepository(Inventory) : getRepository(Inventory)
  const locationRepo: Repository<Location> = trxMgr ? trxMgr.getRepository(Location) : getRepository(Location)

  let inventory: Inventory = targetInventory.inventory
  const leftQty = inventory.qty - loadedQty

  if (leftQty < 0) throw new Error(`Invalid qty, can't exceed limitation`)

  inventory = await inventoryRepo.save({
    ...inventory,
    qty: leftQty,
    weight: inventory.weight - wsd.targetInventory.releaseWeight,
    lastSeq: inventory.lastSeq + 1,
    updater: user
  })

  // 3. add inventory history
  inventory = await inventoryRepo.findOne({
    where: { id: inventory.id },
    relations: ['bizplace', 'product', 'warehouse', 'location']
  })

  // create inventory history for loaded item
  const inventoryHistory: InventoryHistory = {
    ...inventory,
    qty: -loadedQty,
    weight: -wsd.targetInventory.releaseWeight,
    status: INVENTORY_STATUS.LOADED,
    domain,
    name: InventoryNoGenerator.inventoryHistoryName(),
    seq: inventory.lastSeq,
    transactionType: INVENTORY_TRANSACTION_TYPE.LOADING,
    openingQty: inventory.qty + loadedQty,
    openingWeight: inventory.weight + wsd.targetInventory.releaseWeight,
    productId: inventory.product.id,
    warehouseId: inventory.warehouse.id,
    locationId: inventory.location.id,
    refOrderId: releaseGood.id,
    orderRefNo: releaseGood.refNo || null,
    orderNo: releaseGood.name,
    creator: user,
    updater: user
  }
  delete inventoryHistory.id
  await inventoryHistoryRepo.save(inventoryHistory)

  // create inventory history for terminated inventory
  if (inventory.qty <= 0) {
    inventory = await inventoryRepo.save({
      ...inventory,
      status: INVENTORY_STATUS.TERMINATED,
      qty: 0,
      updater: user
    })

    const relatedInventory: Inventory = await inventoryRepo.findOne({
      where: {
        domain,
        location: inventory.location,
        status: Not(Equal(INVENTORY_STATUS.TERMINATED))
      }
    })
    if (!relatedInventory) {
      // 4. 1) - 1 if location doesn't have other inventories => update status of location (status: OCCUPIED or FULL => EMPTY)
      await locationRepo.save({
        ...inventory.location,
        status: LOCATION_STATUS.EMPTY,
        updater: user
      })
    }

    // 4. 1) if status of inventory is TERMINATED, check whether related inventory with specific location exists or not
    const inventoryHistory: InventoryHistory = {
      ...inventory,
      domain,
      name: InventoryNoGenerator.inventoryHistoryName(),
      seq: inventory.lastSeq + 1,
      transactionType: INVENTORY_TRANSACTION_TYPE.TERMINATED,
      refOrderId: releaseGood.id,
      orderRefNo: releaseGood.refNo || null,
      orderNo: releaseGood.name,
      productId: inventory.product.id,
      warehouseId: inventory.warehouse.id,
      locationId: inventory.location.id,
      creator: user,
      updater: user
    }
    delete inventoryHistory.id
    await inventoryHistoryRepo.save(inventoryHistory)
  }
}
