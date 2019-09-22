import { OrderProduct, OrderVas } from '@things-factory/sales-base'
import { getRepository, In } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../entities'

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

    const productsWorksheetDetails = worksheet.worksheetDetails.filter((wd: WorksheetDetail) => wd.targetProduct)
    const vasWorksheetDetails = worksheet.worksheetDetails.filter((wd: WorksheetDetail) => wd.targetVas)
    const arrivalNotice = worksheet.arrivalNotice || null
    const shippingOrder = worksheet.shippingOrder || null

    return {
      worksheetInfo: {
        bizplace: worksheet.bizplace.name,
        containerNo: (arrivalNotice && arrivalNotice.containerNo) || null,
        bufferLocation:
          productsWorksheetDetails &&
          productsWorksheetDetails.length > 0 &&
          productsWorksheetDetails[0].fromLocation.name,
        startedAt: worksheet.startedAt
      },
      worksheetDetail: [
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
