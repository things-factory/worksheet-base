import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { UnloadingReturningWorksheetController } from '../../../../controllers'
import { WorksheetDetail } from '../../../../entities'

export const completeUnloadReturnPartiallyResolver = {
  async completeUnloadReturnPartially(_: any, { returnOrderNo, worksheetDetail }, context: any) {
    return await getManager().transaction(async (trxMgr: EntityManager) => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await completeUnloadReturnPartially(trxMgr, domain, user, returnOrderNo, worksheetDetail)
    })
  }
}

export async function completeUnloadReturnPartially(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  returnOrderNo: string,
  unloadingWorksheetDetail: Partial<WorksheetDetail>
): Promise<void> {
  const worksheetController: UnloadingReturningWorksheetController = new UnloadingReturningWorksheetController(trxMgr, domain, user)
  await worksheetController.completeUnloadReturnPartially(returnOrderNo, unloadingWorksheetDetail)
}
