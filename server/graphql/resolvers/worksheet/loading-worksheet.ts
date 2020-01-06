import { ORDER_STATUS, ReleaseGood, OrderInventory } from '@things-factory/sales-base'
import { Inventory } from '@things-factory/warehouse-base'
import { getRepository, Not, Equal } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const loadingWorksheetResolver = {
  async loadingWorksheet(_: any, { releaseGoodNo }, context: any) {
    const releaseGood: ReleaseGood = await getRepository(ReleaseGood).findOne({
      where: { domain: context.state.domain, name: releaseGoodNo, status: ORDER_STATUS.LOADING },
      relations: ['bizplace']
    })

    if (!releaseGood) throw new Error(`Release good doesn't exists.`)

    const foundWorksheet: Worksheet = await getRepository(Worksheet).findOne({
      where: {
        domain: context.state.domain,
        releaseGood,
        bizplace: releaseGood.bizplace,
        type: WORKSHEET_TYPE.LOADING,
        status: WORKSHEET_STATUS.EXECUTING
      },
      relations: ['bizplace', 'worksheetDetails']
    })

    const foundWSD: WorksheetDetail[] = await getRepository(WorksheetDetail).find({
      where: {
        domain: context.state.domain,
        worksheet: foundWorksheet,
        type: WORKSHEET_TYPE.LOADING,
        status: Not(Equal(WORKSHEET_STATUS.DONE))
      },
      relations: [
        'targetInventory',
        'targetInventory.inventory',
        'targetInventory.inventory.location',
        'targetInventory.inventory.product'
      ]
    })

    return {
      worksheetInfo: {
        bizplaceName: releaseGood.bizplace.name,
        startedAt: foundWorksheet.startedAt,
        refNo: releaseGood.refNo
      },
      worksheetDetailInfos: foundWSD.map(async (loadingWSD: WorksheetDetail) => {
        const targetInventory: OrderInventory = loadingWSD.targetInventory
        const inventory: Inventory = targetInventory.inventory
        return {
          name: loadingWSD.name,
          palletId: inventory.palletId,
          batchId: inventory.batchId,
          product: inventory.product,
          releaseQty: targetInventory.releaseQty,
          releaseWeight: targetInventory.releaseQty,
          status: loadingWSD.status,
          description: loadingWSD.description,
          targetName: targetInventory.name,
          packingType: inventory.packingType,
          inventory: targetInventory.inventory
        }
      })
    }
  }
}
