import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { UnloadingWorksheetController } from '../../../../controllers'
import { WorksheetDetail } from '../../../../entities'

export const completeUnloadingPartiallyResolver = {
  async completeUnloadingPartially(_: any, { arrivalNoticeNo, worksheetDetail }, context: any) {
    return await getManager().transaction(async (trxMgr: EntityManager) => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await completeUnloadingPartially(trxMgr, domain, user, arrivalNoticeNo, worksheetDetail)
    })
  }
}

export async function completeUnloadingPartially(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  arrivalNoticeNo: string,
  unloadingWorksheetDetail: Partial<WorksheetDetail>
): Promise<void> {
  const worksheetController: UnloadingWorksheetController = new UnloadingWorksheetController(trxMgr, domain, user)
  await worksheetController.completeUnloadingPartially(arrivalNoticeNo, unloadingWorksheetDetail)
}
