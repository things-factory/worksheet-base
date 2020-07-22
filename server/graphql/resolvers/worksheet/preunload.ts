import { OrderProduct, ORDER_PRODUCT_STATUS } from '@things-factory/sales-base'
import { getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { WorksheetDetail } from '../../../entities'

export const preunload = {
  async preunload(_: any, { worksheetDetailName, adjustedBatchId, adjustedPalletQty, palletQty }, context: any) {
    return await getManager().transaction(async trxMgr => {
      // 1. find worksheet detail
      const foundWorksheetDetail: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
        where: {
          domain: context.state.domain,
          name: worksheetDetailName,
          type: WORKSHEET_TYPE.UNLOADING
        },
        relations: ['bizplace', 'targetProduct', 'targetProduct.product', 'worksheet']
      })

      if (!foundWorksheetDetail) throw new Error(`WorksheetDetail doesn't exists`)

      let _hasPalletQtyDiff: Boolean = adjustedPalletQty !== palletQty

      // 2. if there is adjustedBatchId, store into orderproduct adjustedBatchId
      if (adjustedBatchId) {
        await trxMgr.getRepository(OrderProduct).save({
          ...foundWorksheetDetail.targetProduct,
          adjustedPalletQty: _hasPalletQtyDiff ? adjustedPalletQty : null,
          adjustedBatchId,
          status: ORDER_PRODUCT_STATUS.PENDING_APPROVAL,
          updater: context.state.user
        })
      } else {
        await trxMgr.getRepository(OrderProduct).save({
          ...foundWorksheetDetail.targetProduct,
          adjustedPalletQty: _hasPalletQtyDiff ? adjustedPalletQty : null,
          status: ORDER_PRODUCT_STATUS.INSPECTED,
          updater: context.state.user
        })
      }

      await trxMgr.getRepository(WorksheetDetail).save({
        ...foundWorksheetDetail,
        status: WORKSHEET_STATUS.INSPECTED,
        updater: context.state.user
      })
    })
  }
}
