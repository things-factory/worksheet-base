import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { CycleCountWorksheetController } from '../../../../controllers'

export const undoInspectionResolver = {
  async undoInspection(_: any, { worksheetDetailName }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await undoInspection(trxMgr, domain, user, worksheetDetailName)
    })
  }
}

export async function undoInspection(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  worksheetDetailName: string
): Promise<void> {
  const worksheetController: CycleCountWorksheetController = new CycleCountWorksheetController(trxMgr, domain, user)
  await worksheetController.undoInspection(worksheetDetailName)
}
