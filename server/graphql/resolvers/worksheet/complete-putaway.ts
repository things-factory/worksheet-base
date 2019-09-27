import { ArrivalNotice, OrderProduct } from '@things-factory/sales-base'
import { Inventory, InventoryHistory } from '@things-factory/warehouse-base'
import { Equal, getManager, getRepository, Not, UpdateResult } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { INVENTORY_STATUS, ORDER_PRODUCT_STATUS, ORDER_STATUS, WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../enum'

export const completePutaway = {
  async completePutaway(_: any, { arrivalNoticeNo }, context: any) {
    return await getManager().transaction(async () => {
      /**
       * 1. Validation for worksheet
       *    - data existing
       */
      const arrivalNotice: ArrivalNotice = await getRepository(ArrivalNotice).findOne({
        where: { domain: context.state.domain, name: arrivalNoticeNo, status: ORDER_STATUS.PROCESSING },
        relations: ['bizplace']
      })

      if (!arrivalNotice) throw new Error(`ArrivalNotice doesn't exists.`)

      const foundPutawayWorksheet: Worksheet = await getRepository(Worksheet).findOne({
        where: {
          domain: context.state.domain,
          bizplace: arrivalNotice.bizplace,
          status: WORKSHEET_STATUS.EXECUTING,
          type: WORKSHEET_TYPE.PUTAWAY,
          arrivalNotice
        },
        relations: ['worksheetDetails', 'worksheetDetails.targetInventory']
      })

      if (!foundPutawayWorksheet) throw new Error(`Worksheet doesn't exists.`)

      // 2. update status of work sheet
      await getRepository(Worksheet).save({
        ...foundPutawayWorksheet,
        status: WORKSHEET_STATUS.DONE,
        endedAt: Date.now(),
        updater: context.state.user
      })

      // 3. insert inventory history table
      const worksheetDetails: WorksheetDetail[] = foundPutawayWorksheet.worksheetDetails

      await getRepository(InventoryHistory).insert(
        worksheetDetails.map((worksheetDetail: WorksheetDetail) => {
          const inventory: any = worksheetDetail.targetInventory
          let inventoryHistory = new InventoryHistory()
          delete inventory.id
          inventory.seq = inventory.lastSeq++
          inventoryHistory = { ...inventory }
          return inventoryHistory
        })
      )
    })
  }
}
