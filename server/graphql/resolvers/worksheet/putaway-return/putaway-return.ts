import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { PutawayReturningWorksheetController } from '../../../../controllers'

export const putawayReturnResolver = {
  async putawayReturn(_: any, { worksheetDetailName, palletId, toLocation }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await putawayReturn(trxMgr, domain, user, worksheetDetailName, palletId, toLocation)
    })
  }
}

async function putawayReturn(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  worksheetDetailName: string,
  palletId: string,
  locationName: string
) {
  const worksheetController: PutawayReturningWorksheetController = new PutawayReturningWorksheetController(trxMgr, domain, user)
  await worksheetController.putawayReturn(worksheetDetailName, palletId, locationName)
}
