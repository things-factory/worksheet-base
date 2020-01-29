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

export const picking = {
  async picking(_: any, { worksheetDetailName, palletId, releaseQty }, context: any) {
    return await getManager().transaction(async trxMgr => {
      // 1. get worksheet detail
      const worksheetDetail: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
        where: {
          domain: context.state.domain,
          name: worksheetDetailName,
          status: WORKSHEET_STATUS.EXECUTING,
          type: WORKSHEET_TYPE.PICKING
        },
        relations: [
          'worksheet',
          'worksheet.releaseGood',
          'targetInventory',
          'targetInventory.inventory',
          'targetInventory.inventory.bizplace',
          'targetInventory.inventory.product',
          'targetInventory.inventory.warehouse',
          'targetInventory.inventory.location'
        ]
      })
      if (!worksheetDetail) throw new Error(`Worksheet Details doesn't exists`)
      let targetInventory: OrderInventory = worksheetDetail.targetInventory
      let inventory: Inventory = targetInventory.inventory

      if (inventory.palletId !== palletId) throw new Error('Pallet ID is invalid')
      if (inventory.qty - releaseQty < 0) throw new Error(`Invalid qty, can't exceed limitation`)

      // Change status of order inventory
      await trxMgr.getRepository(OrderInventory).save({
        ...targetInventory,
        status: ORDER_INVENTORY_STATUS.PICKED,
        updater: context.state.user
      })

      // Change inventory data to release locked qty
      inventory = await trxMgr.getRepository(Inventory).save({
        ...inventory,
        qty: inventory.qty - targetInventory.releaseQty,
        weight: inventory.weight - targetInventory.releaseWeight,
        lockedQty: inventory.lockedQty - targetInventory.releaseQty,
        lastSeq: inventory.lastSeq + 1,
        updater: context.state.user
      })

      // Create inventory history for picking
      const inventoryHistory: InventoryHistory = {
        ...inventory,
        domain: context.state.domain,
        name: InventoryNoGenerator.inventoryHistoryName(),
        seq: inventory.lastSeq,
        transactionType: INVENTORY_TRANSACTION_TYPE.PICKING,
        refOrderId: worksheetDetail.worksheet.releaseGood.id,
        orderNo: worksheetDetail.worksheet.releaseGood.name,
        productId: inventory.product.id,
        warehouseId: inventory.warehouse.id,
        locationId: inventory.location.id,
        qty: -targetInventory.releaseQty,
        openingQty: inventory.qty + targetInventory.releaseQty,
        weight: -targetInventory.releaseWeight,
        openingWeight: inventory.weight + targetInventory.releaseWeight,
        creator: context.state.user,
        updater: context.state.user
      }
      delete inventoryHistory.id
      await trxMgr.getRepository(InventoryHistory).save(inventoryHistory)

      // 6. update status of worksheet details (EXECUTING = > DONE)
      await trxMgr.getRepository(WorksheetDetail).save({
        ...worksheetDetail,
        status: WORKSHEET_STATUS.DONE,
        updater: context.state.user
      })
    })
  }
}
