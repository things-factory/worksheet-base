import { User } from '@things-factory/auth-base'
import { generateCycleCount, InventoryCheck, OrderNoGenerator, ORDER_TYPES } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory } from '@things-factory/warehouse-base'
import { EntityManager, getManager } from 'typeorm'
import { CycleCountWorksheetController } from '../../../../controllers'
import { Worksheet } from '../../../../entities'

export const generateCycleCountWorksheetResolver = {
  async generateCycleCountWorksheet(_: any, { selectedInventory, executionDate }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state

      const createdCycleOrder: InventoryCheck = await generateCycleCount(
        OrderNoGenerator.cycleCount(),
        executionDate,
        ORDER_TYPES.CYCLE_COUNT,
        context.state.domain,
        context.state.user,
        trxMgr
      )

      const cycleCountWorksheet: Worksheet = await generateCycleCountWorksheet(
        trxMgr,
        domain,
        user,
        createdCycleOrder.name,
        selectedInventory
      )

      return { cycleCountWorksheet }
    })
  }
}

export async function generateCycleCountWorksheet(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  cycleCountNo: string,
  inventories: Inventory[]
): Promise<Worksheet> {
  const worksheetController: CycleCountWorksheetController = new CycleCountWorksheetController(trxMgr, domain, user)
  return await worksheetController.generateCycleCountWorksheet(cycleCountNo, inventories)
}
