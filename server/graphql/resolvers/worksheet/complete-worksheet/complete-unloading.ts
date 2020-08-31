import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { InboundWorksheetController } from 'server/controllers/inbound-worksheet-controller'
import { EntityManager, getManager } from 'typeorm'
import { WorksheetDetail } from '../../../../entities'

export const completeUnloadingResolver = {
  async completeUnloading(_: any, { arrivalNoticeNo, worksheetDetails }, context: any) {
    return await getManager().transaction(async (trxMgr: EntityManager) => {
      const { domain, user, referer }: { domain: Domain; user: User; referer: string } = context.state
      await completeUnloading(trxMgr, domain, user, arrivalNoticeNo, worksheetDetails)
      const worksheetController: InboundWorksheetController = new InboundWorksheetController(trxMgr)
      worksheetController.notifiyToOfficeAdmin(domain, {
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
  const worksheetController: InboundWorksheetController = new InboundWorksheetController(trxMgr)
  await worksheetController.completeUnloading({ domain, user, arrivalNoticeNo, unloadingWorksheetDetails })
}
