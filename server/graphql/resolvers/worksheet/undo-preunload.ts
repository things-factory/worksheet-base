import { OrderProduct, ORDER_PRODUCT_STATUS } from '@things-factory/sales-base'
import { getManager } from 'typeorm'
import { WORKSHEET_STATUS } from '../../../constants'
import { WorksheetDetail } from '../../../entities'

export const undoPreunload = {
  async undoPreunload(_: any, { worksheetDetailName }, context: any) {
    return await getManager().transaction(async trxMgr => {
      // 1. update status of worksheetDetail (DONE => EXECUTING)
      const foundWorksheetDetail: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
        where: { domain: context.state.domain, name: worksheetDetailName, status: WORKSHEET_STATUS.INSPECTED },
        relations: ['worksheet', 'worksheet.arrivalNotice', 'bizplace', 'targetProduct']
      })

      if (!foundWorksheetDetail) throw new Error("Worksheet doesn't exists")
      const targetProduct: OrderProduct = foundWorksheetDetail.targetProduct
      await trxMgr.getRepository(OrderProduct).save({
        ...targetProduct,
        status: ORDER_PRODUCT_STATUS.READY_TO_UNLOAD,
        adjustedPalletQty: null,
        adjustedBatchId: null,
        updater: context.state.user
      })

      await trxMgr.getRepository(WorksheetDetail).save({
        ...foundWorksheetDetail,
        status: WORKSHEET_STATUS.DEACTIVATED
      })
    })
  }
}
