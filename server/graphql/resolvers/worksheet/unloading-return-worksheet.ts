import { Bizplace } from '@things-factory/biz-base'
import { ReturnOrder, OrderInventory, ORDER_STATUS } from '@things-factory/sales-base'
import { getRepository } from 'typeorm'
import { WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { fetchExecutingWorksheet } from '../../../utils'

export const unloadingReturnWorksheetResolver = {
  async unloadingReturnWorksheet(_: any, { returnOrderNo }, context: any) {
    const returnOrder: ReturnOrder = await getRepository(ReturnOrder).findOne({
      where: { domain: context.state.domain, name: returnOrderNo /*status: ORDER_STATUS.PROCESSING*/ },
      relations: ['bizplace']
    })
    if (!returnOrder) throw new Error(`Return Order doesn't exist.`)

    const customerBizplace: Bizplace = returnOrder.bizplace
    const worksheet: Worksheet = await fetchExecutingWorksheet(
      context.state.domain,
      customerBizplace,
      [
        'bizplace',
        'bufferLocation',
        'bufferLocation.warehouse',
        'returnOrder',
        'worksheetDetails',
        'worksheetDetails.targetInventory',
        'worksheetDetails.targetInventory.product',
        'worksheetDetails.targetInventory.inventory',
        'creator',
        'updater'
      ],
      WORKSHEET_TYPE.UNLOADING_RETURN,
      returnOrder
    )

    return {
      worksheetInfo: {
        bizplaceName: customerBizplace.name,
        bufferLocation: worksheet.bufferLocation.name,
        startedAt: worksheet.startedAt,
        refNo: returnOrder.refNo
      },
      worksheetDetailInfos: worksheet.worksheetDetails.map(async (productWSD: WorksheetDetail) => {
        const targetInventory: OrderInventory = productWSD.targetInventory

        return {
          name: productWSD.name,
          batchId: targetInventory.batchId,
          palletId: targetInventory.inventory.palletId,
          product: targetInventory.product,
          description: productWSD.description,
          targetName: targetInventory.name,
          packingType: targetInventory.packingType,
          palletQty: targetInventory.palletQty,
          actualPalletQty: targetInventory.actualPalletQty,
          packQty: targetInventory.returnQty,
          actualPackQty: targetInventory.actualPackQty,
          remark: targetInventory.remark,
          issue: productWSD.issue,
          status: productWSD.status
        }
      })
    }
  }
}
