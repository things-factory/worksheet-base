import { InventoryCheck, OrderInventory, ORDER_INVENTORY_STATUS, ORDER_STATUS } from '@things-factory/sales-base'
import { getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../../constants'
import { Worksheet, WorksheetDetail } from '../../../../entities'

export const activateCycleCountResolver = {
  async activateCycleCount(_: any, { worksheetNo }, context: any) {
    return await getManager().transaction(async trxMgr => {
      /**
       * 1. Validation for worksheet
       *    - data existing
       *    - status of worksheet
       */
      const foundWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
        where: {
          domain: context.state.domain,
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
      foundWSDs = foundWSDs.map((wsd: WorksheetDetail) => {
        return { ...wsd, status: WORKSHEET_STATUS.EXECUTING, updater: context.state.user }
      })
      await trxMgr.getRepository(WorksheetDetail).save(foundWSDs)

      /**
       * 3. Update target inventories (status: PENDING => INSPECTING)
       */
      targetInventories = targetInventories.map((ordInv: OrderInventory) => {
        return { ...ordInv, status: ORDER_INVENTORY_STATUS.INSPECTING, updater: context.state.user }
      })
      await trxMgr.getRepository(OrderInventory).save(targetInventories)

      /**
       * 4. Update cycle count Worksheet (status: DEACTIVATED => EXECUTING)
       */
      const worksheet: Worksheet = await trxMgr.getRepository(Worksheet).save({
        ...foundWorksheet,
        status: WORKSHEET_STATUS.EXECUTING,
        startedAt: new Date(),
        updater: context.state.user
      })

      /**
       * 5. Update Inventory check order (status: PENDING => INSPECTING)
       */
      const cycleCount: InventoryCheck = foundWorksheet.inventoryCheck
      await trxMgr.getRepository(InventoryCheck).save({
        ...cycleCount,
        status: ORDER_STATUS.INSPECTING,
        updater: context.state.user
      })

      return worksheet
    })
  }
}
