import { ORDER_STATUS, ReleaseGood, OrderInventory } from '@things-factory/sales-base'
import { Inventory } from '@things-factory/warehouse-base'
import { getRepository } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const loadingWorksheetResolver = {
  async loadingWorksheet(_: any, { releaseGoodNo }, context: any) {
    const releaseGood: ReleaseGood = await getRepository(ReleaseGood).findOne({
      where: { domain: context.state.domain, name: releaseGoodNo, status: ORDER_STATUS.LOADING },
      relations: ['bizplace']
    })

    if (!releaseGood) throw new Error(`Release good doesn't exists.`)

    const worksheet: Worksheet = await getRepository(Worksheet).findOne({
      where: {
        domain: context.state.domain,
        releaseGood,
        bizplace: releaseGood.bizplace,
        type: WORKSHEET_TYPE.LOADING,
        status: WORKSHEET_STATUS.EXECUTING
      },
      relations: [
        'bizplace',
        'worksheetDetails',
        'worksheetDetails.targetInventory',
        'worksheetDetails.targetInventory.inventory',
        'worksheetDetails.targetInventory.inventory.location',
        'worksheetDetails.targetInventory.inventory.product'
      ]
    })

    return {
      worksheetInfo: {
        bizplaceName: releaseGood.bizplace.name,
        startedAt: worksheet.startedAt,
        refNo: releaseGood.refNo
      },
      worksheetDetailInfos: worksheet.worksheetDetails
        .map(async (loadingWSD: WorksheetDetail) => {
          const targetInventory: OrderInventory = loadingWSD.targetInventory
          const inventory: Inventory = targetInventory.inventory
          return {
            name: loadingWSD.name,
            palletId: inventory.palletId,
            batchId: inventory.batchId,
            product: inventory.product,
            releaseQty: targetInventory.releaseQty,
            status: loadingWSD.status,
            description: loadingWSD.description,
            targetName: targetInventory.name,
            packingType: inventory.packingType,
          }
        })
    }
  }
}
