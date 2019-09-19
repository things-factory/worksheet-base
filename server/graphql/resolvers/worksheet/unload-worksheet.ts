import { Bizplace, OrderProduct } from '@things-factory/sales-base'
import { getRepository, In } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { WORKSHEET_STATUS } from '../../../enum'

export const unloadWorksheetResolver = {
  async unloadWorksheet(_: any, { arrivalNoticeNo }, context: any) {
    const worksheet: Worksheet = await getRepository(Worksheet).findOne({
      where: {
        domain: context.state.domain,
        bizplace: In(context.state.bizplaces.map((bizplace: Bizplace) => bizplace.id)),
        status: WORKSHEET_STATUS.EXECUTING,
        arrivalNoticeNo
      },
      relations: [
        'domain',
        'bizplace',
        'arrivalNotice',
        'worksheetDetails',
        'worksheetDetails.fromLocation',
        'worksheetDetails.fromLocation.warehouse',
        'worksheetDetails.toLocation',
        'worksheetDetails.toLocation.warehouse',
        'worksheetDetails.targetProduct',
        'worksheetDetails.targetProduct.product',
        'worksheetDetails.targetVas',
        'worksheetDetails.targetVas.vas',
        'creator',
        'updater'
      ]
    })

    return {
      arrivalNotice: {
        ...worksheet.arrivalNotice
      },
      unloadWorksheetInfo: {
        name: worksheet.name,
        status: worksheet.status,
        bufferLocation: worksheet.worksheetDetails[0].toLocation,
        startedAt: worksheet.startedAt,
        bizplace: worksheet.bizplace
      },
      unloadWorksheetDetails: worksheet.worksheetDetails
        .filter((worksheetDetail: WorksheetDetail) => worksheetDetail.targetProduct)
        .map((worksheetDetail: WorksheetDetail) => {
          const orderProduct: OrderProduct = worksheetDetail.targetProduct
          return {
            name: worksheetDetail.name,
            product: orderProduct.product,
            remark: worksheetDetail.remark,
            packingType: orderProduct.packingType,
            weight: orderProduct.weight,
            unit: orderProduct.unit,
            packQty: orderProduct.packQty,
            totalWeight: orderProduct.totalWeight,
            palletQty: orderProduct.packQty
          }
        })
    }
  }
}
