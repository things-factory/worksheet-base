import { ArrivalNotice, OrderProduct } from '@things-factory/sales-base'
import { getRepository } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { WORKSHEET_STATUS } from '../../../enum'

export const unloadWorksheetResolver = {
  async unloadWorksheet(_: any, { arrivalNoticeNo }, context: any) {
    const arrivalNotice: ArrivalNotice = await getRepository(ArrivalNotice).findOne({
      where: { domain: context.state.domain, name: arrivalNoticeNo },
      relations: ['bizplace']
    })

    if (!arrivalNotice) throw new Error('Data is not exisits.')

    const worksheet: Worksheet = await getRepository(Worksheet).findOne({
      where: {
        domain: context.state.domain,
        bizplace: arrivalNotice.bizplace,
        status: WORKSHEET_STATUS.EXECUTING,
        arrivalNotice
      },
      relations: [
        'domain',
        'bizplace',
        'arrivalNotice',
        'worksheetDetails',
        'worksheetDetails.toLocation',
        'worksheetDetails.toLocation.warehouse',
        'worksheetDetails.targetProduct',
        'worksheetDetails.targetProduct.product'
      ]
    })

    if (worksheet) {
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
              description: worksheetDetail.description,
              packingType: orderProduct.packingType,
              weight: orderProduct.weight,
              unit: orderProduct.unit,
              packQty: orderProduct.packQty,
              totalWeight: orderProduct.totalWeight,
              palletQty: orderProduct.palletQty
            }
          })
      }
    } else {
      throw new Error('Data is not exisits.')
    }
  }
}
