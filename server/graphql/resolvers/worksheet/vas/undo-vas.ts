import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { VasWorksheetController } from '../../../../controllers'
import { WorksheetDetail } from '../../../../entities'

export const undoVasResolver = {
  async undoVas(_: any, { worksheetDetail }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await undoVas(trxMgr, domain, user, worksheetDetail)
    })
  }
}

export async function undoVas(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  worksheetDetail: Partial<WorksheetDetail>
): Promise<void> {
  const worksheetController: VasWorksheetController = new VasWorksheetController(trxMgr, domain, user)
  await worksheetController.undoVAS(worksheetDetail)
}
