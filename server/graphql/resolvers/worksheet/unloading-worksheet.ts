import { ArrivalNotice, OrderProduct } from '@things-factory/sales-base'
import { WORKSHEET_TYPE, WORKSHEET_STATUS } from '../../../enum'
import { getRepository } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const unloadingWorksheetResolver = {
  async unloadingWorksheet(_: any, { arrivalNoticeNo }, context: any) {
    const arrivalNotice: ArrivalNotice = await getRepository(ArrivalNotice).findOne({
      where: { domain: context.state.domain, name: arrivalNoticeNo },
      relations: ['bizplace']
    })

    if (!arrivalNotice) throw new Error(`Arrival notice dosen't exist.`)

    const worksheet: Worksheet = await getRepository(Worksheet).findOne({
      where: {
        domain: context.state.domain,
        arrivalNotice,
        bizplace: arrivalNoticeNo.bizplace,
        type: WORKSHEET_TYPE.UNLOADING,
        status: WORKSHEET_STATUS.EXECUTING
      },
      relations: [
        'domain',
        'bizplace',
        'arrivalNotice',
        'worksheetDetails',
        'worksheetDetails.fromLocation',
        'worksheetDetails.targetProduct',
        'worksheetDetails.targetProduct.product',
        'creator',
        'updater'
      ]
    })

    return {
      worksheetInfo: {
        bizplaceName: worksheet.bizplace.name,
        containerNo: worksheet.bizplace.containerNo,
        bufferLocation: worksheet.worksheetDetails[0].toLocation.name,
        startedAt: worksheet.startedAt
      },
      worksheetDetailInfos: worksheet.worksheetDetails.map((productWSD: WorksheetDetail) => {
        const targetProduct: OrderProduct = productWSD.targetProduct
        return {
          name: productWSD.name,
          product: targetProduct.product,
          description: productWSD.description,
          targetName: targetProduct.name,
          packingType: targetProduct.packingType,
          palletQty: targetProduct.palletQty,
          packQty: targetProduct.packQty,
          remark: targetProduct.remark
        }
      })
    }
  }
}
