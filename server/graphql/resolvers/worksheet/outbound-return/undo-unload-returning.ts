import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { UnloadingReturningWorksheetController } from '../../../../controllers'

export const undoUnloadReturningResolver = {
  async undoUnloadReturning(_: any, { worksheetDetailName, palletId }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await undoUnloadReturning(trxMgr, domain, user, worksheetDetailName, palletId)
    })
  }
}

async function undoUnloadReturning(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  worksheetDetailName: string,
  palletId: string
): Promise<void> {
  const worksheetController: UnloadingReturningWorksheetController = new UnloadingReturningWorksheetController(trxMgr, domain, user)
  await worksheetController.undoUnloadReturning(worksheetDetailName, palletId)
}
