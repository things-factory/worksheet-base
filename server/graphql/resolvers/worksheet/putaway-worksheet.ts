import { ArrivalNotice, OrderInventory, ORDER_STATUS } from '@things-factory/sales-base'
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
        'worksheetDetails.targetInventory.inventory',
        'worksheetDetails.targetInventory.inventory.location',
        'worksheetDetails.targetInventory.inventory.product',
        'worksheetDetails.toLocation'
      ]
    })

    return {
      worksheetInfo: {
        bizplaceName: arrivalNotice.bizplace.name,
        refNo: arrivalNotice.refNo,
        startedAt: worksheet.startedAt
      },
      worksheetDetailInfos: worksheet.worksheetDetails.map(async (putawayWSD: WorksheetDetail) => {
        const targetInventory: OrderInventory = putawayWSD.targetInventory
        const inventory: Inventory = targetInventory.inventory
        return {
          name: putawayWSD.name,
          palletId: inventory.palletId,
          batchId: inventory.batchId,
          product: inventory.product,
          qty: inventory.qty,
          status: putawayWSD.status,
          description: putawayWSD.description,
          targetName: targetInventory.name,
          packingType: inventory.packingType,
          location: inventory.location
        }
      })
    }
  }
}
