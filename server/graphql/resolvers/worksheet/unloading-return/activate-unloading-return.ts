import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { UnloadingReturningWorksheetController, UnloadingReturningWorksheetDetail } from '../../../../controllers'
import { Worksheet, WorksheetDetail } from '../../../../entities'

export const activateUnloadingReturnResolver = {
  async activateUnloadingReturn(_: any, { worksheetNo, unloadingReturnWorksheetDetails }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      return await activateUnloadingReturn(trxMgr, domain, user, worksheetNo, unloadingReturnWorksheetDetails)
    })
  }
}
export async function activateUnloadingReturn(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  worksheetNo: string,
  outboundReturnWorksheetDetails: UnloadingReturningWorksheetDetail[]
): Promise<Worksheet> {
  const worksheetController: UnloadingReturningWorksheetController = new UnloadingReturningWorksheetController(
    trxMgr,
    domain,
    user
  )
  return await worksheetController.activateUnloadingReturn(worksheetNo, outboundReturnWorksheetDetails)
}
