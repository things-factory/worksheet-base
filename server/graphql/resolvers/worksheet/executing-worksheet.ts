import { getRepository, QueryBuilder, In } from 'typeorm'
import { ArrivalNotice, ShippingOrder } from '@things-factory/sales-base'
import { Worksheet } from '../../../entities'
import { ORDER_TYPES } from '../../../enum'
import { ArrivalNoticeWorksheet } from 'server/graphql/types/worksheet/arrival-notice-worksheet'

export const executingWorksheetResolver = {
  async executingWorksheet(_: any, { orderNo }, context: any) {
    const worksheet: Worksheet = await getRepository(Worksheet).findOne({
      where: {
        domain: context.state.domain,
        [orderNo]: In(['arrivalNotice', 'shippingOrder'])
      },
      relations: [
        'domain',
        'bizplace',
        'arrivalNotice, shippingOrder, worksheetDetails',
        'worksheetDetails.fromLocation',
        'worksheetDetails.fromLocation.warehouse',
        'worksheetDetails.toLocation',
        'worksheetDetails.toLocation.warehouse',
        'worksheetDetails.targetProduct',
        'worksheetDetails.targetProduct.product',
        'worksheetDetails.targetVas',
        'worksheetDetails.targetVas.vas'
      ]
    })

    let orderType
    if (worksheet.arrivalNotice) {
      orderType = ORDER_TYPES.ARRIVAL_NOTICE
    } else if (worksheet.shippingOrder) {
      orderType = ORDER_TYPES.SHIPPING
    }

    if (orderType === ORDER_TYPES.ARRIVAL_NOTICE) {
      // When current type of worksheet is arrival notice
      return {
        worksheetInfo: {
          bizplace: `${worksheet.bizplace.name} ${
            worksheet.bizplace.description ? `(${worksheet.bizplace.description})` : ''
          }`,
          containerNo: worksheet.arrivalNotice.containerNo,
          bufferLocation: `${worksheet.worksheetDetails[0].toLocation.name} ${
            worksheet.worksheetDetails[0].toLocation.description
              ? `${worksheet.worksheetDetails[0].toLocation.description}`
              : ''
          }`,
          startedAt: worksheet.startedAt
        },
        worksheetDetailInfos: worksheet.worksheetDetails
      }
    } else if (orderType === ORDER_TYPES.SHIPPING) {
      // When current type of worksheet is shipping
      return {}
    }
  }
}
