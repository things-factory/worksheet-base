import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { OutboundReturningWorksheetController, OutboundReturningWorksheetDetail } from '../../../../controllers'
import { Worksheet, WorksheetDetail } from '../../../../entities'

export const activateOutboundReturnResolver = {
  async activateOutboundReturn(_: any, { worksheetNo, outboundReturnWorksheetDetails }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      return await activateOutboundReturn(trxMgr, domain, user, worksheetNo, outboundReturnWorksheetDetails)
    })
  }
}
export async function activateOutboundReturn(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  worksheetNo: string,
  outboundReturnWorksheetDetails: OutboundReturningWorksheetDetail[]
): Promise<Worksheet> {
  const worksheetController: OutboundReturningWorksheetController = new OutboundReturningWorksheetController(
    trxMgr,
    domain,
    user
  )
  return await worksheetController.activateOutboundReturn(worksheetNo, outboundReturnWorksheetDetails)
}
