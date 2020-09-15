import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { PickingWorksheetController } from '../../../../controllers'
import { WorksheetDetail } from '../../../../entities'

export const assignPickingInventoriesResolver = {
  async assignPickingInventories(
    _: any,
    { worksheetNo, batchId, productId, packingType, worksheetDetails },
    context: any
  ): Promise<void> {
    return await getManager().transaction(async (trxMgr: EntityManager) => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await assignPickingInventories(
        trxMgr,
        domain,
        user,
        worksheetNo,
        batchId,
        productId,
        packingType,
        worksheetDetails
      )
    })
  }
}

export async function assignPickingInventories(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  worksheetNo: string,
  batchId: string,
  productId: string,
  packingType: string,
  worksheetDetails: Partial<WorksheetDetail>[]
): Promise<void> {
  const worksheetController: PickingWorksheetController = new PickingWorksheetController(trxMgr, domain, user)
  await worksheetController.assignPikcingInventories(worksheetNo, batchId, productId, packingType, worksheetDetails)
}
