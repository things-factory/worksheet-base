import { ArrivalNotice, OrderInventory, ORDER_STATUS } from '@things-factory/sales-base'
import { Inventory } from '@things-factory/warehouse-base'
import { getRepository, In } from 'typeorm'
import { WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { fetchExecutingWorksheet } from '../../../utils'

export const putawayWorksheetResolver = {
  async putawayWorksheet(_: any, { arrivalNoticeNo }, context: any) {
    const arrivalNotice: ArrivalNotice = await getRepository(ArrivalNotice).findOne({
      // Because of partial unloading current status of arrivalNotice can be PUTTING_AWAY or PROCESSING
      // PUTTING_AWAY means unloading is completely finished.
      // PROCESSING means some products are still being unloaded.
      where: {
        domain: context.state.domain,
        name: arrivalNoticeNo
        /*status: In([ORDER_STATUS.PUTTING_AWAY, ORDER_STATUS.PROCESSING])*/
      },
      relations: ['bizplace']
    })

    if (!arrivalNotice) throw new Error(`Arrival notice dosen't exist.`)
    const worksheet: Worksheet = await fetchExecutingWorksheet(
      context.state.domain,
      arrivalNotice.bizplace,
      [
        'bizplace',
        'arrivalNotice',
        'worksheetDetails',
        'worksheetDetails.targetInventory',
        'worksheetDetails.targetInventory.inventory',
        'worksheetDetails.targetInventory.inventory.location',
        'worksheetDetails.targetInventory.inventory.product',
        'worksheetDetails.toLocation'
      ],
      WORKSHEET_TYPE.PUTAWAY,
      arrivalNotice
    )

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
