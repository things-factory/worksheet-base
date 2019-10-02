import { Bizplace } from '@things-factory/biz-base'
import { OrderProduct, ORDER_PRODUCT_STATUS } from '@things-factory/sales-base'
import { Inventory, INVENTORY_STATUS } from '@things-factory/warehouse-base'
import { getManager, getRepository } from 'typeorm'
import { WORKSHEET_STATUS } from '../../../constants'
import { WorksheetDetail } from '../../../entities'
import { InventoryNoGenerator } from '../../../utils/inventory-no-generator'

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
      let inventoryData: Inventory = {
        domain: context.state.domain,
        bizplace: customerBizplace,
        palletId: palletId,
        batchId: foundWorksheetDetail.targetProduct.batchId,
        product: foundWorksheetDetail.targetProduct.product,
        packingType: foundWorksheetDetail.targetProduct.packingType,
        warehouse: foundWorksheetDetail.worksheet.bufferLocation.warehouse,
        location: foundWorksheetDetail.worksheet.bufferLocation,
        zone: foundWorksheetDetail.worksheet.bufferLocation.zone,
        status: INVENTORY_STATUS.OCCUPIED
      }
      inventoryData = await getRepository(Inventory).findOne(inventoryData)

      if (inventoryData) {
        // If there's previous inventory => qty has to be merged.
        inventoryData = {
          ...inventoryData,
          qty: inventoryData.qty + qty,
          updater: context.state.user
        }
      } else {
        // If there's no previous inventory
        inventoryData = {
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
          status: INVENTORY_STATUS.OCCUPIED
        }
      }

      // 2. Create new inventory data
      await getRepository(Inventory).save(inventoryData)

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
