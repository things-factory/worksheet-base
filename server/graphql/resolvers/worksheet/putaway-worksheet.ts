import { ArrivalNotice, ORDER_STATUS } from '@things-factory/sales-base'
import { Inventory } from '@things-factory/warehouse-base'
import { getRepository } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const putawayWorksheetResolver = {
  async putawayWorksheet(_: any, { arrivalNoticeNo }, context: any) {
    const arrivalNotice: ArrivalNotice = await getRepository(ArrivalNotice).findOne({
      where: { domain: context.state.domain, name: arrivalNoticeNo, status: ORDER_STATUS.PUTTING_AWAY },
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
        'bizplace',
        'arrivalNotice',
        'worksheetDetails',
        'worksheetDetails.targetInventory',
        'worksheetDetails.targetInventory.location',
        'worksheetDetails.targetInventory.product',
        'worksheetDetails.toLocation'
      ]
    })

    return {
      worksheetInfo: {
        bizplaceName: arrivalNotice.bizplace.name,
        startedAt: worksheet.startedAt
      },
      worksheetDetailInfos: worksheet.worksheetDetails.map(async (putawayWSD: WorksheetDetail) => {
        const targetInventory: Inventory = putawayWSD.targetInventory
        return {
          name: putawayWSD.name,
          palletId: targetInventory.palletId,
          batchId: targetInventory.batchId,
          product: targetInventory.product,
          qty: targetInventory.qty,
          status: putawayWSD.status,
          description: putawayWSD.description,
          targetName: targetInventory.name,
          packingType: targetInventory.packingType,
          location: targetInventory.location,
          toLocation: putawayWSD.toLocation,
          splitedInventories: await getRepository(Inventory).find({
            domain: context.state.domain,
            bizplace: arrivalNotice.bizplace,
            refInventory: targetInventory
          })
        }
      })
    }
  }
}
