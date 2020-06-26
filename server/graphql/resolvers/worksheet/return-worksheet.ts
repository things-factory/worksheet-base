import { ReleaseGood, OrderInventory, ORDER_STATUS } from '@things-factory/sales-base'
import { Inventory } from '@things-factory/warehouse-base'
import { getRepository } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const returnWorksheetResolver = {
  async returnWorksheet(_: any, { releaseGoodNo }, context: any) {
    const releaseGood: ReleaseGood = await getRepository(ReleaseGood).findOne({
      where: { domain: context.state.domain, name: releaseGoodNo, status: ORDER_STATUS.PARTIAL_RETURN },
      relations: ['bizplace']
    })

    if (!releaseGood) throw new Error(`Release good dosen't exist.`)

    const worksheet: Worksheet = await getRepository(Worksheet).findOne({
      where: {
        domain: context.state.domain,
        releaseGood,
        bizplace: releaseGood.bizplace,
        type: WORKSHEET_TYPE.RETURN,
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
    if (!worksheet) throw new Error(`Couldn't find Reutnring Worksheet by order no (${releaseGoodNo})`)

    return {
      worksheetInfo: {
        bizplaceName: releaseGood.bizplace.name,
        refNo: releaseGood.refNo,
        startedAt: worksheet.startedAt
      },
      worksheetDetailInfos: worksheet.worksheetDetails.map(async (returnWSD: WorksheetDetail) => {
        const targetInventory: OrderInventory = returnWSD.targetInventory
        const inventory: Inventory = targetInventory.inventory
        return {
          name: returnWSD.name,
          palletId: inventory.palletId,
          batchId: inventory.batchId,
          product: inventory.product,
          qty: targetInventory.releaseQty,
          status: returnWSD.status,
          description: returnWSD.description,
          targetName: targetInventory.name,
          packingType: inventory.packingType,
          location: inventory.location
        }
      })
    }
  }
}
