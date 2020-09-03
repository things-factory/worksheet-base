import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { UnloadingWorksheetController } from 'server/controllers'
import { EntityManager, getManager } from 'typeorm'

export const undoUnloadingResolver = {
  async undoUnloading(_: any, { worksheetDetailName, palletId }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await undoUnloading(trxMgr, domain, user, worksheetDetailName, palletId)
    })
  }
}

async function undoUnloading(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  worksheetDetailName: string,
  palletId: string
): Promise<void> {
  const worksheetController: UnloadingWorksheetController = new UnloadingWorksheetController(trxMgr, domain, user)
  await worksheetController.undoUnload(worksheetDetailName, palletId)
}
