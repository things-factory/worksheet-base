import { User } from '@things-factory/auth-base'
import { generateCycleCount, InventoryCheck } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory } from '@things-factory/warehouse-base'
import { EntityManager, getManager } from 'typeorm'
import { CycleCountWorksheetController } from '../../../../controllers'
import { Worksheet } from '../../../../entities'

export const generateCycleCountWorksheetResolver = {
  async generateCycleCountWorksheet(_: any, { executionDate, customerId }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state

      const cycleCountWorksheet: Worksheet = await generateCycleCountWorksheet(
        trxMgr,
        domain,
        user,
        executionDate,
        customerId
      )

      return { cycleCountWorksheet }
    })
  }
}

export async function generateCycleCountWorksheet(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  executionDate: string,
  customerId: string
): Promise<Worksheet> {
  const worksheetController: CycleCountWorksheetController = new CycleCountWorksheetController(trxMgr, domain, user)
  return await worksheetController.generateCycleCountWorksheet(executionDate, customerId)
}
