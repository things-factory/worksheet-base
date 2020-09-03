import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { ReturningWorksheetController } from '../../../../controllers'
import { WorksheetController } from '../../../../controllers/worksheet-controller'
import { Worksheet } from '../../../../entities'

export const completeReturnResolver = {
  async completeReturn(_: any, { releaseGoodNo }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      let worksheet: Worksheet = await completeReturn(trxMgr, domain, user, releaseGoodNo)

      const worksheetController: WorksheetController = new WorksheetController(trxMgr, domain, user)
      if (!worksheet.bizplace?.id) {
        worksheet = await worksheetController.findWorksheetById(worksheet.id, ['bizplace'])
      }

      const bizplace: Bizplace = worksheet.bizplace
      await worksheetController.notifyToCustomer(bizplace, {
        title: `Stock has been returned to storage`,
        message: `${releaseGoodNo} is done`,
        url: context.header.referer
      })
    })
  }
}

export async function completeReturn(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  releaseGoodNo: string
): Promise<Worksheet> {
  const worksheetController: ReturningWorksheetController = new ReturningWorksheetController(trxMgr, domain, user)
  return await worksheetController.completeReturning(releaseGoodNo)
}
