import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { PutawayWorksheetController } from '../../../../controllers'

export const undoPutawayResolver = {
  async undoPutaway(_: any, { worksheetDetailName, palletId }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await undoPutaway(trxMgr, domain, user, worksheetDetailName, palletId)
    })
  }
}

export async function undoPutaway(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  worksheetDetailName: string,
  palletId: string
): Promise<void> {
  const worksheetController: PutawayWorksheetController = new PutawayWorksheetController(trxMgr, domain, user)
  await worksheetController.undoPutaway(worksheetDetailName, palletId)
}
