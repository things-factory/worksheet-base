import { OrderInventory, ORDER_INVENTORY_STATUS } from '@things-factory/sales-base'
import {
  Inventory,
  InventoryHistory,
  InventoryNoGenerator,
  INVENTORY_TRANSACTION_TYPE
} from '@things-factory/warehouse-base'
import { getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { WorksheetDetail } from '../../../entities'
import { generateDeliveryOrder } from '@things-factory/sales-base'

export const loading = {
  async loading(_: any, { worksheetDetailName, palletId, deliveryOrder }, context: any) {
    return await getManager().transaction(async trxMgr => {
      // 1. get worksheet detail
      const worksheetDetail: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
        where: {
          domain: context.state.domain,
          name: worksheetDetailName,
          status: WORKSHEET_STATUS.EXECUTING,
          type: WORKSHEET_TYPE.LOADING
        },
        relations: ['worksheet', 'targetInventory', 'targetInventory.inventory']
      })
      if (!worksheetDetail) throw new Error(`Worksheet Details doesn't exists`)
      let targetInventory: OrderInventory = worksheetDetail.targetInventory
      let inventory: Inventory = targetInventory.inventory
      if (inventory.palletId !== palletId) throw new Error('Pallet ID is invalid')

      // 3. add inventory history
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

      await trxMgr.getRepository(OrderInventory).save({
        ...targetInventory,
        status: ORDER_INVENTORY_STATUS.LOADED,
        updater: context.state.user
      })

      await generateDeliveryOrder(deliveryOrder, context.state.domain, context.state.user, trxMgr)

      // 6. update status of worksheet details (EXECUTING = > DONE)
      await trxMgr.getRepository(WorksheetDetail).save({
        ...worksheetDetail,
        status: WORKSHEET_STATUS.DONE,
        updater: context.state.user
      })
    })
  }
}
