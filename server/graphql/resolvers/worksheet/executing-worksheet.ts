import { OrderProduct, OrderVas, ArrivalNotice, ShippingOrder } from '@things-factory/sales-base'
import { getRepository, In } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { ORDER_TYPES } from 'server/enum'

export const executingWorksheetResolver = {
  async executingWorksheet(_: any, { orderNo, orderType }, context: any) {
    let order
    if (orderType === ORDER_TYPES.ARRIVAL_NOTICE) {
      order = await getRepository(ArrivalNotice).findOne({
        where: { domain: context.state.domain, name: orderNo }
      })
    } else if (orderType === ORDER_TYPES.SHIPPING) {
      order = await getRepository(ShippingOrder).findOne({
        where: { domain: context.state.domain, name: orderNo }
      })
    }

    const worksheet: Worksheet = await getRepository(Worksheet).findOne({
      where: {
        domain: context.state.domain,
        [order.id]: In(['arrivalNotice', 'shippingOrder'])
      },
      relations: [
        'domain',
        'bizplace',
        'arrivalNotice',
        'shippingOrder',
        'worksheetDetails',
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

    const productsWorksheetDetails = worksheet.worksheetDetails.filter((wd: WorksheetDetail) => wd.targetProduct)
    const vasWorksheetDetails = worksheet.worksheetDetails.filter((wd: WorksheetDetail) => wd.targetVas)
    const arrivalNotice = worksheet.arrivalNotice || null
    const shippingOrder = worksheet.shippingOrder || null

    return {
      worksheetInfo: {
        orderType: orderType,
        bizplace: worksheet.bizplace.name,
        containerNo: (arrivalNotice && arrivalNotice.containerNo) || null,
        bufferLocation:
          productsWorksheetDetails &&
          productsWorksheetDetails.length > 0 &&
          productsWorksheetDetails[0].fromLocation.name,
        startedAt: worksheet.startedAt
      },
      worksheetDetailInfos: [
        ...productsWorksheetDetails.map((productWD: WorksheetDetail) => {
          const targetProduct: OrderProduct = productWD.targetProduct
          return {
            product: targetProduct.product,
            description: productWD.description,
            packingType: targetProduct.packingType,
            palletQty: targetProduct.palletQty,
            packQty: targetProduct.packQty,
            remark: targetProduct.remark
          }
        }),
        ...vasWorksheetDetails.map((vasWD: WorksheetDetail) => {
          const targetVas: OrderVas = vasWD.targetVas
          return {
            batchId: targetVas.batchId,
            vas: targetVas.vas,
            description: vasWD.description,
            remark: targetVas.remark
          }
        })
      ]
    }
  }
}
