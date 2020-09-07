import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { PutawayWorksheetController } from '../../../../controllers'

export const putawayResolver = {
  async putaway(_: any, { worksheetDetailName, palletId, toLocation }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await putaway(trxMgr, domain, user, worksheetDetailName, palletId, toLocation)
    })
  }
}

async function putaway(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  worksheetDetailName: string,
  palletId: string,
  locationName: string
) {
  const worksheetController: PutawayWorksheetController = new PutawayWorksheetController(trxMgr, domain, user)
  await worksheetController.putaway(worksheetDetailName, palletId, locationName)
}
