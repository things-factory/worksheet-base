import { ArrivalNotice, OrderProduct } from '@things-factory/sales-base'
import { getRepository } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { ORDER_STATUS, WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../enum'

export const unloadingWorksheetResolver = {
  async unloadingWorksheet(_: any, { arrivalNoticeNo }, context: any) {
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
        type: WORKSHEET_TYPE.UNLOADING,
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
        bizplaceName: worksheet.bizplace.name,
        containerNo: arrivalNotice.containerNo,
        bufferLocation: worksheet.bufferLocation.name,
        startedAt: worksheet.startedAt
      },
      worksheetDetailInfos: worksheet.worksheetDetails.map((productWSD: WorksheetDetail) => {
        const targetProduct: OrderProduct = productWSD.targetProduct
        return {
          name: productWSD.name,
          batchId: targetProduct.batchId,
          product: targetProduct.product,
          description: productWSD.description,
          targetName: targetProduct.name,
          packingType: targetProduct.packingType,
          palletQty: targetProduct.palletQty,
          packQty: targetProduct.packQty,
          remark: targetProduct.remark,
          status: productWSD.status
        }
      })
    }
  }
}
