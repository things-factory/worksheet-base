import { ArrivalNotice, OrderProduct } from '@things-factory/sales-base'
import { getRepository } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { ORDER_STATUS, WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../enum'

export const putawayWorksheetResolver = {
  async putawayWorksheet(_: any, { arrivalNoticeNo }, context: any) {
    const arrivalNotice: ArrivalNotice = await getRepository(ArrivalNotice).findOne({
      where: { domain: context.state.domain, name: arrivalNoticeNo, status: ORDER_STATUS.PROCESSING },
      relations: ['bizplace']
    })

    if (!arrivalNotice) throw new Error(`Arrival notice dosen't exist.`)

    const worksheet: Worksheet = await getRepository(Worksheet).findOne({
      where: {
        domain: context.state.domain,
        arrivalNotice,
        bizplace: arrivalNotice.bizplace,
        type: WORKSHEET_TYPE.PUTAWAY,
        status: WORKSHEET_STATUS.EXECUTING
      },
      relations: [
        'bizplace',
        'arrivalNotice',
        'worksheetDetails',
        'worksheetDetails.toLocation',
        'worksheetDetails.targetProduct',
        'worksheetDetails.targetProduct.product',
        'creator',
        'updater'
      ]
    })

    return {
      worksheetInfo: {
        bizplaceName: worksheet.bizplace.name,
        containerNo: arrivalNotice.containerNo,
        bufferLocation: worksheet.worksheetDetails[0].toLocation.name,
        startedAt: worksheet.startedAt
      },
      worksheetDetailInfos: worksheet.worksheetDetails.map((putawayWSD: WorksheetDetail) => {
        const targetProduct: OrderProduct = putawayWSD.targetProduct
        return {
          name: putawayWSD.name,
          product: targetProduct.product,
          description: putawayWSD.description,
          targetName: targetProduct.name,
          toLocation: putawayWSD.toLocation,
          packingType: targetProduct.packingType,
          palletQty: targetProduct.palletQty,
          actualPalletQty: targetProduct.actualPalletQty,
          packQty: targetProduct.packQty,
          actualQty: targetProduct.actualQty,
          remark: targetProduct.remark
        }
      })
    }
  }
}
