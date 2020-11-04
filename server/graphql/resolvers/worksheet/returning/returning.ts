import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { ReturningWorksheetController } from '../../../../controllers'

export const returningResolver = {
  async returning(_: any, { worksheetDetailName, palletId, toLocation }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await returning(trxMgr, domain, user, worksheetDetailName, palletId, toLocation)
    })
  }
}

export async function returning(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  worksheetDetailName: string,
  palletId: string,
  toLocationName: string
): Promise<void> {
  const worksheetController: ReturningWorksheetController = new ReturningWorksheetController(trxMgr, domain, user)
  await worksheetController.returning(worksheetDetailName, palletId, toLocationName)
}
