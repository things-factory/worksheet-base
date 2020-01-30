import { OrderProduct, ORDER_PRODUCT_STATUS } from '@things-factory/sales-base'
import {
  Inventory,
  INVENTORY_STATUS,
  INVENTORY_TRANSACTION_TYPE,
  Location,
  LOCATION_STATUS
} from '@things-factory/warehouse-base'
import { getManager } from 'typeorm'
import { WORKSHEET_STATUS } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { generateInventoryHistory } from '../../../utils/inventory-history-generator'

export const undoUnloading = {
  async undoUnloading(_: any, { worksheetDetailName, palletId }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const foundWorksheetDetail: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
        where: { domain: context.state.domain, name: worksheetDetailName, status: WORKSHEET_STATUS.EXECUTING },
        relations: ['bizplace', 'targetProduct', 'worksheet', 'worksheet.arrivalNotice']
      })

      if (!foundWorksheetDetail) throw new Error("Worksheet doesn't exists")
      const arrivalNotice = foundWorksheetDetail.worksheet.arrivalNotice

      // 1. find inventory
      let inventory: Inventory = await trxMgr.getRepository(Inventory).findOne({
        where: {
          domain: context.state.domain,
          status: INVENTORY_STATUS.UNLOADED,
          palletId
        },
        relations: ['location']
      })
      const bufferLocation: Location = inventory.location
      const inventoryQty = inventory.qty
      const inventoryWeight = inventory.weight

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
        weight: 0,
        updater: context.state.user
      })

      inventory = await trxMgr.getRepository(Inventory).findOne({
        where: { id: inventory.id },
        relations: ['bizplace', 'product', 'warehouse', 'location']
      })

      await generateInventoryHistory(
        inventory,
        arrivalNotice,
        INVENTORY_TRANSACTION_TYPE.UNDO_UNLOADING,
        -inventoryQty,
        -inventoryWeight,
        context.state.user,
        trxMgr
      )

      await trxMgr.getRepository(Inventory).delete(inventory.id)

      // Check whether related worksheet exists or not with specific buffer location
      const relatedWorksheetCnt: number = await trxMgr
        .getRepository(Worksheet)
        .count({ domain: context.state.domain, bufferLocation })

      // if there's no related worksheet => update status of location to EMPTY
      if (!relatedWorksheetCnt) {
        await trxMgr.getRepository(Location).save({
          ...bufferLocation,
          status: LOCATION_STATUS.EMPTY,
          updater: context.state.user
        })
      }
    })
  }
}
