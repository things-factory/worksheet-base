import { Bizplace } from '@things-factory/biz-base'
import { ArrivalNotice, OrderProduct, ORDER_STATUS } from '@things-factory/sales-base'
import { getRepository } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const preunloadWorksheetResolver = {
  async preunloadWorksheet(_: any, { arrivalNoticeNo }, context: any) {
    const arrivalNotice: ArrivalNotice = await getRepository(ArrivalNotice).findOne({
      where: { domain: context.state.domain, name: arrivalNoticeNo, status: ORDER_STATUS.READY_TO_UNLOAD },
      relations: ['bizplace']
    })

    if (!arrivalNotice) throw new Error(`Arrival notice dosen't exist.`)
    const customerBizplace: Bizplace = arrivalNotice.bizplace

    const worksheet: Worksheet = await getRepository(Worksheet).findOne({
      where: {
        domain: context.state.domain,
        arrivalNotice,
        bizplace: customerBizplace,
        type: WORKSHEET_TYPE.UNLOADING,
        status: WORKSHEET_STATUS.DEACTIVATED
      },
      relations: [
        'bizplace',
        'bufferLocation',
        'bufferLocation.warehouse',
        'arrivalNotice',
        'worksheetDetails',
        'worksheetDetails.targetProduct',
        'worksheetDetails.targetProduct.product',
        'creator',
        'updater'
      ]
    })

    if (!worksheet) throw new Error(`Worksheet dosen't exist.`)

    return {
      worksheetInfo: {
        bizplaceName: customerBizplace.name,
        containerNo: arrivalNotice.containerNo,
        bufferLocation: worksheet.bufferLocation.name,
        startedAt: worksheet.startedAt,
        refNo: arrivalNotice.refNo
      },
      worksheetDetailInfos: worksheet.worksheetDetails.map(async (productWSD: WorksheetDetail) => {
        const targetProduct: OrderProduct = productWSD.targetProduct

        return {
          name: productWSD.name,
          batchId: targetProduct.batchId,
          adjustedBatchId: targetProduct?.adjustedBatchId ? targetProduct.adjustedBatchId : '',
          product: targetProduct.product,
          description: productWSD.description,
          targetName: targetProduct.name,
          packingType: targetProduct.packingType,
          palletQty: targetProduct.palletQty,
          adjustedPalletQty: targetProduct?.adjustedPalletQty ? targetProduct.adjustedPalletQty : null,
          packQty: targetProduct.packQty,
          remark: targetProduct.remark,
          status: targetProduct.status
        }
      })
    }
  }
}
