import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { OutboundWorksheetController } from '../../../../controllers'
import { Worksheet, WorksheetDetail } from '../../../../entities'

export const activateReturnResolver = {
  async activateReturn(_: any, { worksheetNo, returnWorksheetDetails }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      return await activateReturn(trxMgr, domain, user, worksheetNo, returnWorksheetDetails)
    })
  }
}
export async function activateReturn(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  worksheetNo: string,
  returningWorksheetDetails: Partial<WorksheetDetail>[]
): Promise<Worksheet> {
  const worksheetController: OutboundWorksheetController = new OutboundWorksheetController(trxMgr)
  return await worksheetController.activateReturning({ domain, user, worksheetNo, returningWorksheetDetails })
}
