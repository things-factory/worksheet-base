import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { UnloadingWorksheetController } from '../../../../controllers'

export const undoPreunloadResolver = {
  async undoPreunload(_: any, { worksheetDetailName }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await undoPreunload(trxMgr, domain, user, worksheetDetailName)
    })
  }
}

export async function undoPreunload(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  worksheetDetailName: string
): Promise<void> {
  const worksheetController: UnloadingWorksheetController = new UnloadingWorksheetController(trxMgr, domain, user)
  await worksheetController.undoPreunload(worksheetDetailName)
}
