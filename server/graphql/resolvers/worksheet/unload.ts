import { Bizplace } from '@things-factory/biz-base'
import { OrderProduct, ORDER_PRODUCT_STATUS } from '@things-factory/sales-base'
import { Inventory, InventoryNoGenerator, INVENTORY_STATUS, InventoryHistory } from '@things-factory/warehouse-base'
import { getManager, getRepository } from 'typeorm'
import { WORKSHEET_STATUS } from '../../../constants'
import { WorksheetDetail } from '../../../entities'

export const unload = {
  async unload(_: any, { worksheetDetailName, inventory }, context: any) {
    return await getManager().transaction(async () => {
      const palletId = inventory.palletId
      const qty = inventory.qty

      // 1. find worksheet detail
      const foundWorksheetDetail: WorksheetDetail = await getRepository(WorksheetDetail).findOne({
        where: {
          domain: context.state.domain,
          name: worksheetDetailName,
          status: WORKSHEET_STATUS.EXECUTING
        },
        relations: [
          'bizplace',
          'targetProduct',
          'targetProduct.product',
          'worksheet',
          'worksheet.bufferLocation',
          'worksheet.bufferLocation.warehouse'
        ]
      })

      if (!foundWorksheetDetail) throw new Error(`WorksheetDetail doesn't exists`)
      const customerBizplace: Bizplace = foundWorksheetDetail.bizplace

      // 2. Create new inventory data
      // Find previous pallet ( Same batchId, Same product, Same pallet id)
      const prevInventory: Inventory = await getRepository(Inventory).findOne({
        domain: context.state.domain,
        bizplace: customerBizplace,
        palletId: palletId,
        warehouse: foundWorksheetDetail.worksheet.bufferLocation.warehouse,
        location: foundWorksheetDetail.worksheet.bufferLocation,
        zone: foundWorksheetDetail.worksheet.bufferLocation.zone
      })

      if (prevInventory) throw new Error('pallet id is duplicated')

      // 2. Create new inventory data
      let newInventory: Inventory = await getRepository(Inventory).save({
        domain: context.state.domain,
        bizplace: customerBizplace,
        palletId: palletId,
        batchId: foundWorksheetDetail.targetProduct.batchId,
        name: InventoryNoGenerator.inventoryName(),
        product: foundWorksheetDetail.targetProduct.product,
        packingType: foundWorksheetDetail.targetProduct.packingType,
        qty,
        warehouse: foundWorksheetDetail.worksheet.bufferLocation.warehouse,
        location: foundWorksheetDetail.worksheet.bufferLocation,
        zone: foundWorksheetDetail.worksheet.bufferLocation.zone,
        status: INVENTORY_STATUS.OCCUPIED,
        creator: context.state.user,
        updater: context.state.user
      })

      // 3. Create new inventory history data
      newInventory = await getRepository(Inventory).find({
        where: { id: newInventory.id },
        relations: ['bizplace', 'product', 'warehouse', 'location']
      })
      delete newInventory.id
      await getRepository(InventoryHistory).save({
        ...newInventory,
        domain: context.state.domain,
        name: InventoryNoGenerator.inventoryHistoryName(),
        seq: newInventory.lastSeq,
        productId: newInventory.product.id,
        warehouseId: newInventory.warehouse.id,
        locationId: newInventory.location.id,
        creator: context.state.user,
        updater: context.state.user
      })

      // 3. Update qty of targetProduct
      await getRepository(OrderProduct).save({
        ...foundWorksheetDetail.targetProduct,
        actualPalletQty: foundWorksheetDetail.targetProduct.actualPalletQty + 1,
        actualPackQty: foundWorksheetDetail.targetProduct.actualPackQty + qty,
        status: ORDER_PRODUCT_STATUS.UNLOADED,
        updater: context.state.user
      })
    })
  }
}
