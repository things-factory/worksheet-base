import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { PickingWorksheetController } from '../../../../controllers/'
import { Worksheet } from '../../../../entities'

export const generateReleaseGoodWorksheetResolver = {
  async generateReleaseGoodWorksheet(_: any, { releaseGoodNo }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      return await generatePickingWorksheet(trxMgr, domain, user, releaseGoodNo)
    })
  }
}

export async function generatePickingWorksheet(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  releaseGoodNo: string
): Promise<Worksheet> {
  const worksheetController: PickingWorksheetController = new PickingWorksheetController(trxMgr, domain, user)
  return await worksheetController.generatePickingWorksheet(releaseGoodNo)
}
