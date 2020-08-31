import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { VasWorksheetController } from '../../../../controllers/vas-worksheet-controller'
import { WorksheetDetail } from '../../../../entities'

export const activateVasResolver = {
  async activateVas(_: any, { worksheetNo, vasWorksheetDetails }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.swtate
      return await activateVas(trxMgr, domain, user, worksheetNo, vasWorksheetDetails)
    })
  }
}

export async function activateVas(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  worksheetNo: string,
  vasWorksheetDetails: Partial<WorksheetDetail>[]
) {
  const worksheetController: VasWorksheetController = new VasWorksheetController(trxMgr)
  return await worksheetController.activateVAS({ domain, user, worksheetNo, vasWorksheetDetails })
}
