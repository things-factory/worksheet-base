import { OrderProduct, ORDER_PRODUCT_STATUS } from '@things-factory/sales-base'
import { Inventory, InventoryHistory, InventoryNoGenerator, INVENTORY_STATUS } from '@things-factory/warehouse-base'
import { getManager } from 'typeorm'
import { WORKSHEET_STATUS } from '../../../constants'
import { WorksheetDetail } from '../../../entities'

export const undoUnloading = {
  async undoUnloading(_: any, { worksheetDetailName, palletId }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const foundWorksheetDetail: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
        where: { domain: context.state.domain, name: worksheetDetailName, status: WORKSHEET_STATUS.EXECUTING },
        relations: ['bizplace', 'fromLocation', 'toLocation', 'targetProduct']
      })

      if (!foundWorksheetDetail) throw new Error("Worksheet doesn't exists")

      // 1. find inventory
      let inventory: Inventory = await trxMgr.getRepository(Inventory).findOne({
        domain: context.state.domain,
        status: INVENTORY_STATUS.OCCUPIED,
        palletId
      })

      await trxMgr.getRepository(OrderProduct).save({
        ...foundWorksheetDetail.targetProduct,
        actualPackQty: foundWorksheetDetail.targetProduct.actualPackQty - inventory.qty,
        actualPalletQty: foundWorksheetDetail.targetProduct.actualPalletQty - 1,
        status: ORDER_PRODUCT_STATUS.UNLOADING,
        updater: context.state.user
      })

      await trxMgr.getRepository(WorksheetDetail).save({
        ...foundWorksheetDetail,
        status: WORKSHEET_STATUS.EXECUTING,
        updater: context.state.user
      })

      // update inventory qty to 0
      await trxMgr.getRepository(Inventory).save({
        ...inventory,
        lastSeq: inventory.lastSeq + 1,
        status: INVENTORY_STATUS.DELETED,
        qty: 0,
        updater: context.state.user
      })

      inventory = await trxMgr.getRepository(Inventory).findOne({
        where: { id: inventory.id },
        relations: ['bizplace', 'product', 'warehouse', 'location']
      })
      const inventoryHistory: InventoryHistory = {
        ...inventory,
        domain: context.state.domain,
        name: InventoryNoGenerator.inventoryHistoryName(),
        seq: inventory.lastSeq,
        productId: inventory.product.id,
        warehouseId: inventory.warehouse.id,
        locationId: inventory.location.id,
        creator: context.state.user,
        updater: context.state.user
      }
      delete inventoryHistory.id
      await trxMgr.getRepository(InventoryHistory).save(inventoryHistory)
      await trxMgr.getRepository(Inventory).delete(inventory.id)
    })
  }
}
