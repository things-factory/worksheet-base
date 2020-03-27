import { ArrivalNotice } from '@things-factory/sales-base'
import { Inventory, INVENTORY_STATUS } from '@things-factory/warehouse-base'
import { getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { generatePutawayWorksheet } from './generate-putaway-worksheet'

export const generatePartialPutawayWorksheetResolver = {
  async generatePartialPutawayWorksheet(_: any, { arrivalNoticeNo, inventories }, context: any): Promise<void> {
    return await getManager().transaction(async trxMgr => {
      const arrivalNotice: ArrivalNotice = await trxMgr.getRepository(ArrivalNotice).findOne({
        where: {
          domain: context.state.domain,
          name: arrivalNoticeNo
        },
        relations: ['bizplace']
      })

      inventories = await trxMgr.getRepository(Inventory).findByIds(inventories.map((inv: Inventory) => inv.id))
      await generatePutawayWorksheet(context.state.domain, arrivalNotice, inventories, context.state.user, trxMgr)
      const unloadingWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
        where: { arrivalNotice, type: WORKSHEET_TYPE.UNLOADING },
        relations: [
          'worksheetDetails',
          'worksheetDetails.targetInventory',
          'worksheetDetails.targetInventory.inventory'
        ]
      })
      const worksheetDetails: WorksheetDetail[] = unloadingWorksheet.worksheetDetails
      await Promise.all(
        worksheetDetails.map(async (wsd: WorksheetDetail) => {
          if (wsd?.targetInventory?.inventory?.status !== INVENTORY_STATUS.PARTIALLY_UNLOADED) {
            await trxMgr.getRepository(WorksheetDetail).save({
              ...wsd,
              status: WORKSHEET_STATUS.EXECUTING,
              updater: context.state.user
            })
          }
        })
      )
    })
  }
}
