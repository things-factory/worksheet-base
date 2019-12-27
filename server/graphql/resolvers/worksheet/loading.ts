import {
  generateDeliveryOrder,
  OrderInventory,
  ReleaseGood,
  ORDER_INVENTORY_STATUS,
  ORDER_STATUS
} from '@things-factory/sales-base'
import {
  Inventory,
  InventoryHistory,
  InventoryNoGenerator,
  INVENTORY_TRANSACTION_TYPE
} from '@things-factory/warehouse-base'
import { Bizplace } from '@things-factory/biz-base'
import { getManager, In } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { WorksheetDetail } from '../../../entities'

export const loading = {
  async loading(_: any, { worksheetDetailNames, releaseGoodNo, transportDriver, transportVehicle }, context: any) {
    return await getManager().transaction(async trxMgr => {
      // 1. get worksheet detail
      let worksheetDetails: WorksheetDetail[] = await trxMgr.getRepository(WorksheetDetail).find({
        where: {
          domain: context.state.domain,
          name: In(worksheetDetailNames),
          status: WORKSHEET_STATUS.EXECUTING,
          type: WORKSHEET_TYPE.LOADING
        },
        relations: ['bizplace', 'worksheet', 'worksheet.releaseGood', 'targetInventory', 'targetInventory.inventory']
      })
      if (worksheetDetails.length <= 0) throw new Error(`No worksheet details are found`)
      const releaseGood: ReleaseGood = await trxMgr.getRepository(ReleaseGood).findOne({
        where: { domain: context.state.domain, name: releaseGoodNo, status: ORDER_STATUS.LOADING },
        relations: ['bizplace']
      })
      const customerBizplace: Bizplace = releaseGood.bizplace

      let targetInventories: OrderInventory[] = worksheetDetails.map(
        (worksheetDetail: WorksheetDetail) => worksheetDetail.targetInventory
      )

      let inventories: Inventory[] = targetInventories.map(
        (targetInventory: OrderInventory) => targetInventory.inventory
      )

      // Create inventory history
      inventories = await Promise.all(
        inventories.map(async (inventory: Inventory) => {
          inventory = await trxMgr.getRepository(Inventory).findOne({
            where: { id: inventory.id },
            relations: ['bizplace', 'product', 'warehouse', 'location']
          })

          const inventoryHistory: InventoryHistory = {
            ...inventory,
            domain: context.state.domain,
            name: InventoryNoGenerator.inventoryHistoryName(),
            seq: inventory.lastSeq,
            transactionType: INVENTORY_TRANSACTION_TYPE.LOADING,
            productId: inventory.product.id,
            warehouseId: inventory.warehouse.id,
            locationId: inventory.location.id,
            creator: context.state.user,
            updater: context.state.user
          }
          delete inventoryHistory.id
          await trxMgr.getRepository(InventoryHistory).save(inventoryHistory)
        })
      )

      // Update status of order inventories
      targetInventories = await Promise.all(
        targetInventories.map(async (targetInventory: OrderInventory) => {
          return {
            ...targetInventory,
            status: ORDER_INVENTORY_STATUS.LOADED,
            updater: context.state.user
          }
        })
      )
      await trxMgr.getRepository(OrderInventory).save(targetInventories)

      // update status of worksheet details (EXECUTING = > DONE)
      worksheetDetails = await Promise.all(
        worksheetDetails.map(async (worksheetDetail: WorksheetDetail) => {
          return {
            ...worksheetDetail,
            status: ORDER_INVENTORY_STATUS.LOADED,
            updater: context.state.user
          }
        })
      )
      await trxMgr.getRepository(WorksheetDetail).save(worksheetDetails)

      await generateDeliveryOrder(
        transportDriver,
        transportVehicle,
        targetInventories,
        customerBizplace,
        releaseGood,
        context.state.domain,
        context.state.user,
        trxMgr
      )
    })
  }
}
