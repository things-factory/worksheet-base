import { User } from '@things-factory/auth-base'
import { ORDER_STATUS, VasOrder } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { VasWorksheetController } from '../../../../controllers/'
import { Worksheet } from '../../../../entities'

export const generateVasOrderWorksheetResolver = {
  async generateVasOrderWorksheet(_: any, { vasNo }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      const foundVasOrder: VasOrder = await trxMgr.getRepository(VasOrder).findOne({
        where: { domain, name: vasNo, status: ORDER_STATUS.PENDING_RECEIVE }
      })

      return await generateVasOrderWorksheet(trxMgr, domain, user, foundVasOrder)
    })
  }
}

export async function generateVasOrderWorksheet(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  vasOrder: VasOrder
): Promise<Worksheet> {
  const worksheetController: VasWorksheetController = new VasWorksheetController(trxMgr, domain, user)
  return await worksheetController.generateVasWorksheet(vasOrder)
}
