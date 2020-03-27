import { Bizplace } from '@things-factory/biz-base'
import { ArrivalNotice, OrderProduct, ORDER_STATUS } from '@things-factory/sales-base'
import { getRepository, In } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const unloadingWorksheetResolver = {
  async unloadingWorksheet(_: any, { arrivalNoticeNo }, context: any) {
    const arrivalNotice: ArrivalNotice = await getRepository(ArrivalNotice).findOne({
      where: { domain: context.state.domain, name: arrivalNoticeNo, status: ORDER_STATUS.PROCESSING },
      relations: ['bizplace']
    })

    if (!arrivalNotice) throw new Error(`Arrival notice dosen't exist.`)
    const customerBizplace: Bizplace = arrivalNotice.bizplace

    const worksheet: Worksheet = await getRepository(Worksheet).findOne({
      where: {
        domain: context.state.domain,
        arrivalNotice,
        bizplace: customerBizplace,
        type: In([WORKSHEET_TYPE.UNLOADING, WORKSHEET_TYPE.PUTAWAY]),
        status: WORKSHEET_STATUS.EXECUTING
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
          product: targetProduct.product,
          description: productWSD.description,
          targetName: targetProduct.name,
          packingType: targetProduct.packingType,
          palletQty: targetProduct.palletQty,
          actualPalletQty: targetProduct.actualPalletQty,
          packQty: targetProduct.packQty,
          actualPackQty: targetProduct.actualPackQty,
          remark: targetProduct.remark,
          issue: productWSD.issue,
          status: productWSD.status
        }
      })
    }
  }
}
