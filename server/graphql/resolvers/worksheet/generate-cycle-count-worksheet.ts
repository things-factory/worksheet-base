import { Bizplace, getMyBizplace } from '@things-factory/biz-base'
import {
  generateCycleCount,
  InventoryCheck,
  OrderInventory,
  OrderNoGenerator,
  ORDER_INVENTORY_STATUS,
  ORDER_TYPES
} from '@things-factory/sales-base'
import { Inventory, INVENTORY_STATUS } from '@things-factory/warehouse-base'
import { getManager, In } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { WorksheetNoGenerator } from '../../../utils'

export const generateCycleCountWorksheet = {
  async generateCycleCountWorksheet(_: any, { selectedInventory, executionDate }, context: any) {
    return await getManager().transaction(async trxMgr => {
      // generate order no for inventory check
      const cycleCountNo: any = OrderNoGenerator.cycleCount()
      const orderType: any = ORDER_TYPES.CYCLE_COUNT
      const myBizplace: Bizplace = await getMyBizplace(context.state.user)

      // generate order inventory
      const createdCycleOrder: InventoryCheck = await generateCycleCount(
        cycleCountNo,
        executionDate,
        orderType,
        context.state.domain,
        context.state.user,
        trxMgr
      )

      // Find all the inventory ID based on selected inventory
      const foundInv: Inventory[] = await trxMgr.getRepository(Inventory).find({
        where: {
          domain: context.state.domain,
          palletId: In(selectedInventory.map(inv => inv.palletId)),
          status: INVENTORY_STATUS.STORED
        }
      })

      // generate order inventory mapping with inventory ID
      const createdOIs: OrderInventory[] = await trxMgr.getRepository(OrderInventory).save(
        await Promise.all(
          foundInv.map(async (inv: Inventory) => {
            let newOrderInv: OrderInventory = {
              domain: context.state.domain,
              bizplace: myBizplace,
              status: ORDER_INVENTORY_STATUS.PENDING,
              name: OrderNoGenerator.orderInventory(),
              inventoryCheck: createdCycleOrder,
              releaseQty: 0,
              releaseWeight: 0,
              inventory: inv,
              creator: context.state.user,
              updater: context.state.user
            }

            return newOrderInv
          })
        )
      )

      // set a locked qty at all selected inventory
      const lockedInv: Inventory[] = foundInv.map((inv: Inventory) => {
        return {
          ...inv,
          lockedQty: inv.qty,
          lockedWeight: inv.lockedWeight,
          updater: context.state.user
        }
      })
      await trxMgr.getRepository(Inventory).save(lockedInv)

      // create cycle count worksheet
      const cycleCountWorksheet = await trxMgr.getRepository(Worksheet).save({
        domain: context.state.domain,
        bizplace: myBizplace,
        name: WorksheetNoGenerator.cycleCount(),
        inventoryCheck: createdCycleOrder,
        type: WORKSHEET_TYPE.CYCLE_COUNT,
        status: WORKSHEET_STATUS.DEACTIVATED,
        creator: context.state.user,
        updater: context.state.user
      })

      // generate worksheet detail
      const cycleCountWSD = createdOIs.map((oi: OrderInventory) => {
        return {
          domain: context.state.domain,
          bizplace: myBizplace,
          worksheet: cycleCountWorksheet,
          name: WorksheetNoGenerator.cycleCountDetail(),
          targetInventory: oi,
          type: WORKSHEET_TYPE.CYCLE_COUNT,
          status: WORKSHEET_STATUS.DEACTIVATED,
          creator: context.state.user,
          updater: context.state.user
        }
      })
      await trxMgr.getRepository(WorksheetDetail).save(cycleCountWSD)

      /**
       * 6. Returning worksheet as a result
       */
      return { cycleCountWorksheet }
    })
  }
}
