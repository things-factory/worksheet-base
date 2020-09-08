import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { UnloadingWorksheetController } from '../../../../controllers'
import { WorksheetDetail } from '../../../../entities'

export const completeUnloadingResolver = {
  async completeUnloading(_: any, { arrivalNoticeNo, worksheetDetails }, context: any) {
    return await getManager().transaction(async (trxMgr: EntityManager) => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await completeUnloading(trxMgr, domain, user, arrivalNoticeNo, worksheetDetails)

      const worksheetController: UnloadingWorksheetController = new UnloadingWorksheetController(trxMgr, domain, user)
      worksheetController.notifiyToOfficeAdmin({
        title: `Unloading Completed`,
        message: `${arrivalNoticeNo} is ready for putaway`,
        url: context.header.referer
      })
    })
  }
}

export async function completeUnloading(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  arrivalNoticeNo: string,
  unloadingWorksheetDetails: Partial<WorksheetDetail>[]
): Promise<void> {
  const worksheetController: UnloadingWorksheetController = new UnloadingWorksheetController(trxMgr, domain, user)
  await worksheetController.completeUnloading(arrivalNoticeNo, unloadingWorksheetDetails)
}
