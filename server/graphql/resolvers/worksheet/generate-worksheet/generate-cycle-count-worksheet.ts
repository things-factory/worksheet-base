import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { CycleCountWorksheetController } from '../../../../controllers'
import { Worksheet } from '../../../../entities'

export const generateCycleCountWorksheetResolver = {
  async generateCycleCountWorksheet(_: any, { executionDate, customerId, orderInventoryIds, limit }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state

      const cycleCountWorksheet: Worksheet = await generateCycleCountWorksheet(
        trxMgr,
        domain,
        user,
        executionDate,
        customerId,
        orderInventoryIds,
        limit
      )

      return cycleCountWorksheet
    })
  }
}

export async function generateCycleCountWorksheet(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  executionDate: string,
  customerId: string,
  orderInventoryIds: string [] = [],
  limit: number
): Promise<Worksheet> {
  const worksheetController: CycleCountWorksheetController = new CycleCountWorksheetController(trxMgr, domain, user)
  return await worksheetController.generateCycleCountWorksheet(executionDate, customerId, orderInventoryIds, limit)
}
