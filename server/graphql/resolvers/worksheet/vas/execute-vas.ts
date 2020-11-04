import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { VasWorksheetController } from '../../../../controllers'
import { WorksheetDetail } from '../../../../entities'

export const executeVasResolver = {
  async executeVas(_: any, { worksheetDetail, palletId }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      /**
       * @description If pallet id param is exists.
       * Meaning, the VAS order have been requested with Arrival Notice or Release Order
       * Those types of VAS doesn't have flow to assign specific vas target inventory
       * Assignment should be done within executeVas transaction.
       */
      await executeVas(trxMgr, domain, user, worksheetDetail, palletId)
    })
  }
}

export async function executeVas(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  worksheetDetail: Partial<WorksheetDetail>,
  palletId?: string
): Promise<void> {
  const worksheetController: VasWorksheetController = new VasWorksheetController(trxMgr, domain, user)
  await worksheetController.executeVAS(worksheetDetail, palletId)
}
