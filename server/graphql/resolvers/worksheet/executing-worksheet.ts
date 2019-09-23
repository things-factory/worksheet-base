import { ArrivalNotice, OrderProduct, OrderVas, ShippingOrder } from '@things-factory/sales-base'
import { ORDER_TYPES, WORKSHEET_STATUS } from 'server/enum'
import { getRepository } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const executingWorksheetResolver = {
  async executingWorksheet(_: any, { orderNo, orderType }, context: any) {
    let where: any
    if (orderType === ORDER_TYPES.ARRIVAL_NOTICE) {
      const arrivalNotice: ArrivalNotice = await getRepository(ArrivalNotice).findOne({
        where: { domain: context.state.domain, name: orderNo },
        relations: ['bizplace']
      })

      where = {
        domain: context.state.domain,
        bizplace: arrivalNotice.bizplace,
        status: WORKSHEET_STATUS.EXECUTING,
        arrivalNotice: arrivalNotice
      }
    } else if (orderType === ORDER_TYPES.SHIPPING) {
      const shippingOrder: ShippingOrder = await getRepository(ShippingOrder).findOne({
        where: { domain: context.state.domain, name: orderNo },
        relations: ['bizplace']
      })

      where = {
        domain: context.state.domain,
        bizplace: shippingOrder.bizplace,
        status: WORKSHEET_STATUS.EXECUTING,
        shippingOrder: shippingOrder
      }
    }

    const worksheet: Worksheet = await getRepository(Worksheet).findOne({
      where,
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

    const productsWSDs = (worksheet.worksheetDetails || []).filter((wd: WorksheetDetail) => wd.targetProduct)
    const vasWSDs = (worksheet.worksheetDetails || []).filter((wd: WorksheetDetail) => wd.targetVas)
    const arrivalNotice = worksheet.arrivalNotice || null
    const shippingOrder = worksheet.shippingOrder || null

    return {
      worksheetInfo: {
        bizplaceName: worksheet.bizplace.name,
        containerNo: (arrivalNotice && arrivalNotice.containerNo) || null,
        bufferLocation: (productsWSDs[0] && productsWSDs[0].toLocation && productsWSDs[0].toLocation.name) || null,
        startedAt: worksheet.startedAt
      },
      worksheetDetailInfos: [
        ...productsWSDs.map((productWD: WorksheetDetail) => {
          const targetProduct: OrderProduct = productWD.targetProduct
          return {
            name: productWD.name,
            product: targetProduct.product,
            description: productWD.description,
            targetName: targetProduct.name,
            packingType: targetProduct.packingType,
            palletQty: targetProduct.palletQty,
            packQty: targetProduct.packQty,
            remark: targetProduct.remark
          }
        }),
        ...vasWSDs.map((vasWD: WorksheetDetail) => {
          const targetVas: OrderVas = vasWD.targetVas
          return {
            name: vasWD.name,
            batchId: targetVas.batchId,
            targetName: targetVas.name,
            vas: targetVas.vas,
            description: vasWD.description,
            remark: targetVas.remark
          }
        })
      ]
    }
  }
}
