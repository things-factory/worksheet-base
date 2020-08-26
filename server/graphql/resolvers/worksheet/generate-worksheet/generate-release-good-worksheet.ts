import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { OutboundWorksheetController } from '../../../../controllers/outbound-worksheet-controller'
import { Worksheet } from '../../../../entities'

export const generateReleaseGoodWorksheetResolver = {
  async generateReleaseGoodWorksheet(_: any, { releaseGoodNo }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      return await generateReleaseGoodWorksheet(trxMgr, domain, user, releaseGoodNo)
    })
  }
}

export async function generateReleaseGoodWorksheet(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  releaseGoodNo: string
): Promise<Worksheet> {
  const worksheetController: OutboundWorksheetController = new OutboundWorksheetController(trxMgr)
  return await worksheetController.generatePickingWorksheet({ domain, user, releaseGoodNo })
}
