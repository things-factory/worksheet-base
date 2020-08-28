import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { OutboundWorksheetController } from '../../../../controllers/outbound-worksheet-controller'
import { Worksheet } from '../../../../entities'

export const activatePickingResolver = {
  async activatePicking(_: any, { worksheetNo }, context: any) {
    return await getManager().transaction(async (trxMgr: EntityManager) => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      return await activatePicking(trxMgr, domain, user, worksheetNo)
    })
  }
}

export async function activatePicking(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  worksheetNo: string
): Promise<Worksheet> {
  const worksheetController: OutboundWorksheetController = new OutboundWorksheetController(trxMgr)
  return await worksheetController.activatePicking({ domain, user, worksheetNo })
}
