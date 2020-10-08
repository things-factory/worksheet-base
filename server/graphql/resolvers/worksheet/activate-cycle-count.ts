import { InventoryCheck, OrderInventory, ORDER_INVENTORY_STATUS, ORDER_STATUS } from '@things-factory/sales-base'
import { getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { Domain } from '@things-factory/shell'
import { User } from '@things-factory/auth-base'

export const activateCycleCount = {
  async activateCycleCount(_: any, { worksheetNo }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      /**
       * 1. Validation for worksheet
       *    - data existing
       *    - status of worksheet
       */
      let foundWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
        where: {
          domain,
          name: worksheetNo,
          type: WORKSHEET_TYPE.CYCLE_COUNT,
          status: WORKSHEET_STATUS.DEACTIVATED
        },
        relations: ['bizplace', 'inventoryCheck', 'worksheetDetails', 'worksheetDetails.targetInventory']
      })

      if (!foundWorksheet) throw new Error(`Worksheet doesn't exists`)
      let foundWSDs: WorksheetDetail[] = foundWorksheet.worksheetDetails
      let targetInventories: OrderInventory[] = foundWSDs.map((foundWSD: WorksheetDetail) => foundWSD.targetInventory)

      /**
       * 2. Update status of picking worksheet details (status: DEACTIVATED => EXECUTING)
       */
      for (let i: number = 0; i < foundWSDs.length; i++) {
        let foundWSD: WorksheetDetail = foundWSDs[i]
        foundWSD.status = WORKSHEET_STATUS.EXECUTING
        foundWSD.updater = user
      }
      await trxMgr.getRepository(WorksheetDetail).save(foundWSDs, { chunk: 500 })

      /**
       * 3. Update target inventories (status: PENDING => INSPECTING)
       */
      for (let i: number = 0; i < targetInventories.length; i++) {
        let targetInventory: OrderInventory = targetInventories[i]
        targetInventory.status = ORDER_INVENTORY_STATUS.INSPECTING
        targetInventory.updater = user
      }
      await trxMgr.getRepository(OrderInventory).save(targetInventories, { chunk: 500 })

      let cycleCount: InventoryCheck = foundWorksheet.inventoryCheck
      cycleCount.status = ORDER_STATUS.INSPECTING
      cycleCount.updater = user
      await trxMgr.getRepository(InventoryCheck).save(cycleCount)

      /**
       * 4. Update cycle count Worksheet (status: DEACTIVATED => EXECUTING)
       */
      foundWorksheet.status = WORKSHEET_STATUS.EXECUTING
      foundWorksheet.startedAt = new Date()
      foundWorksheet.updater = user
      foundWorksheet = await trxMgr.getRepository(Worksheet).save(foundWorksheet)

      return foundWorksheet
    })
  }
}
