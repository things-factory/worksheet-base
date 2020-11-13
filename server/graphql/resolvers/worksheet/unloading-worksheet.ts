import { Bizplace } from '@things-factory/biz-base'
import { ArrivalNotice, OrderProduct, ORDER_STATUS } from '@things-factory/sales-base'
import { getRepository } from 'typeorm'
import { WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { fetchExecutingWorksheet } from '../../../utils'

export const unloadingWorksheetResolver = {
  async unloadingWorksheet(_: any, { arrivalNoticeNo }, context: any) {
    const arrivalNotice: ArrivalNotice = await getRepository(ArrivalNotice).findOne({
      where: { domain: context.state.domain, name: arrivalNoticeNo /*status: ORDER_STATUS.PROCESSING*/ },
      relations: ['bizplace']
    })
    if (!arrivalNotice) throw new Error(`Arrival notice doesn't exist.`)

    const customerBizplace: Bizplace = arrivalNotice.bizplace
    const worksheet: Worksheet = await fetchExecutingWorksheet(
      context.state.domain,
      customerBizplace,
      [
        'bizplace',
        'bufferLocation',
        'bufferLocation.warehouse',
        'arrivalNotice',
        'worksheetDetails',
        'worksheetDetails.targetProduct',
        'worksheetDetails.targetProduct.product',
        'creator',
        'updater'
      ],
      WORKSHEET_TYPE.UNLOADING,
      arrivalNotice
    )

    const vasWorksheet: Worksheet = await getRepository(Worksheet).findOne({
      where: {
        domain: context.state.domain,
        arrivalNotice,
        type: WORKSHEET_TYPE.VAS
      },
      relations: [
        'bizplace',
        'bufferLocation',
        'bufferLocation.warehouse',
        'arrivalNotice',
        'worksheetDetails',
        'worksheetDetails.targetVas',
        'worksheetDetails.targetVas.vas',
        'creator',
        'updater'
      ]
    })

    return {
      worksheetInfo: {
        bizplaceName: customerBizplace.name,
        containerNo: arrivalNotice.containerNo,
        bufferLocation: worksheet.bufferLocation.name,
        startedAt: worksheet.startedAt,
        refNo: arrivalNotice.refNo,
        looseItem: arrivalNotice.looseItem,
        orderVas: vasWorksheet ? vasWorksheet.worksheetDetails : null
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
