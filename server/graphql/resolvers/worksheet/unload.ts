import { Bizplace } from '@things-factory/biz-base'
import { ArrivalNotice, OrderProduct, ORDER_PRODUCT_STATUS } from '@things-factory/sales-base'
import {
  Inventory,
  Pallet,
  InventoryNoGenerator,
  INVENTORY_STATUS,
  INVENTORY_TRANSACTION_TYPE,
  Location,
  LOCATION_STATUS
} from '@things-factory/warehouse-base'
import { Equal, getManager, Not } from 'typeorm'
import { WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { generateInventoryHistory } from '../../../utils'

export const unload = {
  async unload(_: any, { worksheetDetailName, inventory }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const palletId = inventory.palletId
      // check duplication of pallet id
      const duplicatedInventory: Inventory = await trxMgr.getRepository(Inventory).findOne({
        where: {
          domain: context.state.domain,
          palletId,
          status: Not(Equal(INVENTORY_STATUS.TERMINATED))
        }
      })

      if (duplicatedInventory) throw new Error(`Pallet ID (${duplicatedInventory.palletId}) is duplicated`)

      const qty = inventory.qty

      // 1. find worksheet detail
      const foundWorksheetDetail: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
        where: {
          domain: context.state.domain,
          name: worksheetDetailName,
          type: WORKSHEET_TYPE.UNLOADING
        },
        relations: [
          'bizplace',
          'targetProduct',
          'targetProduct.product',
          'worksheet',
          'worksheet.arrivalNotice',
          'worksheet.bufferLocation',
          'worksheet.bufferLocation.warehouse'
        ]
      })

      if (!foundWorksheetDetail) throw new Error(`WorksheetDetail doesn't exists`)

      const worksheet: Worksheet = foundWorksheetDetail.worksheet
      const arrivalNotice: ArrivalNotice = worksheet.arrivalNotice
      const customerBizplace: Bizplace = foundWorksheetDetail.bizplace
      const bufferLocation: Location = foundWorksheetDetail.worksheet.bufferLocation

      let reusablePalletData = null
      if (inventory.reusablePallet) {
        reusablePalletData = await trxMgr.getRepository(Pallet).findOne({
          domain: context.state.domain,
          id: inventory.reusablePallet
        })
      }

      // 2. Create new inventory data
      // Find previous pallet ( Same batchId, Same product, Same pallet id)
      const prevInventory: Inventory = await trxMgr.getRepository(Inventory).findOne({
        domain: context.state.domain,
        bizplace: customerBizplace,
        palletId: palletId,
        status: Not(Equal(INVENTORY_STATUS.TERMINATED)),
        warehouse: foundWorksheetDetail.worksheet.bufferLocation.warehouse,
        location: foundWorksheetDetail.worksheet.bufferLocation,
        zone: foundWorksheetDetail.worksheet.bufferLocation.zone
      })

      if (prevInventory) throw new Error('pallet id is duplicated')

      // 3. Create new inventory data
      let newInventory: Inventory = await trxMgr.getRepository(Inventory).save({
        domain: context.state.domain,
        bizplace: customerBizplace,
        palletId: palletId,
        batchId: foundWorksheetDetail.targetProduct.batchId,
        name: InventoryNoGenerator.inventoryName(),
        product: foundWorksheetDetail.targetProduct.product,
        packingType: foundWorksheetDetail.targetProduct.packingType,
        qty,
        weight: Math.round(inventory.qty * foundWorksheetDetail.targetProduct.weight * 100) / 100,
        refOrderId: arrivalNotice.id,
        reusablePallet: reusablePalletData,
        warehouse: foundWorksheetDetail.worksheet.bufferLocation.warehouse,
        location: foundWorksheetDetail.worksheet.bufferLocation,
        zone: foundWorksheetDetail.worksheet.bufferLocation.zone,
        orderProductId: foundWorksheetDetail.targetProduct.id,
        status: INVENTORY_STATUS.UNLOADED,
        creator: context.state.user,
        updater: context.state.user
      })

      // 4. Create new inventory history data
      await generateInventoryHistory(
        newInventory,
        arrivalNotice,
        INVENTORY_TRANSACTION_TYPE.UNLOADING,
        qty,
        Math.round(inventory.qty * foundWorksheetDetail.targetProduct.weight * 100) / 100,
        context.state.user,
        trxMgr
      )

      // 5. Update status and qty of targetProduct
      await trxMgr.getRepository(OrderProduct).save({
        ...foundWorksheetDetail.targetProduct,
        actualPalletQty: foundWorksheetDetail.targetProduct.actualPalletQty + 1,
        actualPackQty: foundWorksheetDetail.targetProduct.actualPackQty + qty,
        status: ORDER_PRODUCT_STATUS.UNLOADED,
        updater: context.state.user
      })

      // 6. Update status of buffer location
      // 6. 1) If status of location is empty
      if (bufferLocation.status === LOCATION_STATUS.EMPTY) {
        await trxMgr.getRepository(Location).save({
          ...bufferLocation,
          status: LOCATION_STATUS.OCCUPIED,
          updater: context.state.user
        })
      }
    })
  }
}
