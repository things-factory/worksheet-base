import { OrderInventory, ORDER_INVENTORY_STATUS } from '@things-factory/sales-base'
import { getManager, Not } from 'typeorm'
import { WORKSHEET_STATUS } from '../../../constants'
import { WorksheetDetail } from '../../../entities'

export const undoInspection = {
  async undoInspection(_: any, { worksheetDetailName }, context: any) {
    return await getManager().transaction(async trxMgr => {
      // 1. update status of worksheetDetail (DONE => EXECUTING)
      const foundWorksheetDetail: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
        where: { domain: context.state.domain, name: worksheetDetailName, status: Not(WORKSHEET_STATUS.EXECUTING) },
        relations: [
          'worksheet',
          'worksheet.inventoryCheck',
          'bizplace',
          'fromLocation',
          'toLocation',
          'targetInventory'
        ]
      })

      if (!foundWorksheetDetail) throw new Error("Worksheet doesn't exists")
      const targetInventory: OrderInventory = foundWorksheetDetail.targetInventory
      await trxMgr.getRepository(OrderInventory).save({
        ...targetInventory,
        inspectedLocation: null,
        inspectedQty: null,
        inspectedWeight: null,
        inspectedBatchNo: null,
        status: ORDER_INVENTORY_STATUS.INSPECTING,
        updater: context.state.user
      })

      await trxMgr.getRepository(WorksheetDetail).save({
        ...foundWorksheetDetail,
        status: WORKSHEET_STATUS.EXECUTING
      })
    })
  }
}
