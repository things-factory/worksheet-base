import { Bizplace } from '@things-factory/biz-base'
import { OrderInventory, ORDER_STATUS, ORDER_INVENTORY_STATUS, InventoryCheck } from '@things-factory/sales-base'
import { Inventory } from '@things-factory/warehouse-base'
import { getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const completeInspection = {
  async completeInspection(_: any, { inventoryCheckNo }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const inventoryCheck: InventoryCheck = await trxMgr.getRepository(InventoryCheck).findOne({
        where: { domain: context.state.domain, name: inventoryCheckNo, status: ORDER_STATUS.INSPECTING },
        relations: ['bizplace', 'orderInventories']
      })

      if (!inventoryCheck) throw new Error(`Inspection order doesn't exists.`)
      const ownDomainBizplace: Bizplace = inventoryCheck.bizplace
      const foundInspectionWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
        where: {
          domain: context.state.domain,
          bizplace: ownDomainBizplace,
          status: WORKSHEET_STATUS.EXECUTING,
          type: WORKSHEET_TYPE.CYCLE_COUNT,
          inventoryCheck
        },
        relations: [
          'worksheetDetails',
          'worksheetDetails.targetInventory',
          'worksheetDetails.targetInventory.inventory'
        ]
      })

      if (!foundInspectionWorksheet) throw new Error(`Worksheet doesn't exists.`)
      const worksheetDetails: WorksheetDetail[] = foundInspectionWorksheet.worksheetDetails
      const targetInventories: OrderInventory[] = worksheetDetails.map((wsd: WorksheetDetail) => wsd.targetInventory)

      // filter out not tally inventory
      const notTallyInv: WorksheetDetail[] = worksheetDetails.filter(
        (wsd: WorksheetDetail) => wsd.status === WORKSHEET_STATUS.NOT_TALLY
      )

      const tallyOI: OrderInventory[] = targetInventories.filter(
        (oi: OrderInventory) => oi.status === ORDER_INVENTORY_STATUS.INSPECTED
      )

      if (tallyOI?.length > 0) {
        await Promise.all(
          tallyOI.map(async (oi: OrderInventory) => {
            const tallyInv: Inventory = oi.inventory

            const terminatedOI = {
              ...oi,
              status: ORDER_INVENTORY_STATUS.TERMINATED,
              updater: context.state.user
            }
            await trxMgr.getRepository(OrderInventory).save(terminatedOI)

            await trxMgr.getRepository(Inventory).save({
              ...tallyInv,
              lockedQty: 0,
              lockedWeight: 0,
              updater: context.state.user
            })
          })
        )
      }

      if (notTallyInv?.length == 0) {
        // terminate all order inventory if all inspection accuracy is 100%
        await Promise.all(
          targetInventories.map(async (oi: OrderInventory) => {
            const allTerminatedOI = {
              ...oi,
              status: ORDER_INVENTORY_STATUS.TERMINATED,
              updater: context.state.user
            }
            await trxMgr.getRepository(OrderInventory).save(allTerminatedOI)
          })
        )
      }

      // Update status and endedAt of worksheet
      await trxMgr.getRepository(Worksheet).save({
        ...foundInspectionWorksheet,
        status: WORKSHEET_STATUS.DONE,
        endedAt: new Date(),
        updater: context.state.user
      })

      if (notTallyInv?.length > 0) {
        // 3. update status of inventory check
        await trxMgr.getRepository(InventoryCheck).save({
          ...inventoryCheck,
          status: ORDER_STATUS.PENDING_REVIEW,
          updater: context.state.user
        })
      } else {
        // 3. update status of inventory check
        await trxMgr.getRepository(InventoryCheck).save({
          ...inventoryCheck,
          status: ORDER_STATUS.DONE,
          updater: context.state.user
        })
      }

      // TODO: Add notification to admin and office admin
    })
  }
}
