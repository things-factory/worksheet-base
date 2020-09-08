import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { UnloadingWorksheetController, WorksheetController } from '../../../../controllers'
import { Worksheet } from '../../../../entities'

export const completePreunloadResolver = {
  async completePreunload(_: any, { arrivalNoticeNo }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await completePreunload(trxMgr, domain, user, arrivalNoticeNo)

      const worksheetController: WorksheetController = new WorksheetController(trxMgr, domain, user)
      worksheetController.notifiyToOfficeAdmin({
        title: `Pending Adjustment for ${arrivalNoticeNo}`,
        message: `Pending process for batch id adjustments`,
        url: context.header.referer
      })
    })
  }
}

export async function completePreunload(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  arrivalNoticeNo: string
): Promise<Worksheet> {
  const worksheetController: UnloadingWorksheetController = new UnloadingWorksheetController(trxMgr, domain, user)
  return await worksheetController.completePreunloading(arrivalNoticeNo)
}
