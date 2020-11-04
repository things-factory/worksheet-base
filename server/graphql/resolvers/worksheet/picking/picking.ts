import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { PickingWorksheetController } from '../../../../controllers'

export const pickingResolver = {
  async picking(_: any, { worksheetDetailName, palletId, locationName, releaseQty }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await picking(trxMgr, domain, user, worksheetDetailName, palletId, locationName, releaseQty)
    })
  }
}

export async function picking(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  worksheetDetailName: string,
  palletId: string,
  locationName: string,
  releaseQty: number
) {
  const worksheetController: PickingWorksheetController = new PickingWorksheetController(trxMgr, domain, user)
  await worksheetController.picking(worksheetDetailName, palletId, locationName, releaseQty)
}
