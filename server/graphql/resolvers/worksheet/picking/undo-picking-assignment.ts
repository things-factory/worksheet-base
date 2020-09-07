import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { PickingWorksheetController } from '../../../../controllers'

export const undoPickingAssigmentResolver = {
  async undoPickingAssigment(_: any, { worksheetNo, batchId, productId, packingType }, context: any): Promise<void> {
    return await getManager().transaction(async (trxMgr: EntityManager) => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await undoPickingAssigment(trxMgr, domain, user, worksheetNo, batchId, productId, packingType)
    })
  }
}

export async function undoPickingAssigment(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  worksheetNo: string,
  batchId: string,
  productId: string,
  packingType: string
): Promise<void> {
  const worksheetController: PickingWorksheetController = new PickingWorksheetController(trxMgr, domain, user)
  await worksheetController.undoPickingAssigment(worksheetNo, batchId, productId, packingType)
}
