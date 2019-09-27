import { ArrivalNotice } from '@things-factory/sales-base'
import { Inventory } from '@things-factory/warehouse-base'
import { getRepository } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { ORDER_STATUS, WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../enum'

export const putawayWorksheetResolver = {
  async putawayWorksheet(_: any, { arrivalNoticeNo }, context: any) {
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
        type: WORKSHEET_TYPE.PUTAWAY,
        status: WORKSHEET_STATUS.EXECUTING
      },
      relations: [
        'arrivalNotice',
        'worksheetDetails',
        'worksheetDetails.targetInventory',
        'worksheetDetails.targetInventory.product'
      ]
    })

    return {
      worksheetInfo: {
        bizplaceName: worksheet.bizplace.name,
        startedAt: worksheet.startedAt
      },
      worksheetDetailInfos: worksheet.worksheetDetails.map((putawayWSD: WorksheetDetail) => {
        const targetInventory: Inventory = putawayWSD.targetInventory
        return {
          name: putawayWSD.name,
          palletId: targetInventory.palletId,
          batchId: targetInventory.batchId,
          product: targetInventory.product,
          status: putawayWSD.status,
          description: putawayWSD.description,
          targetName: targetInventory.name,
          packingType: targetInventory.packingType,
          toLocation: targetInventory.toLocation
        }
      })
    }
  }
}
