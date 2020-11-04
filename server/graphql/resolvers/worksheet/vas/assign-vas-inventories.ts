import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { Inventory } from '@things-factory/warehouse-base'
import { EntityManager, getManager } from 'typeorm'
import { VasWorksheetController } from '../../../../controllers'

export const assignVasInventoriesResolver = {
  async assignVasInventories(_: any, { worksheetDetailIds, inventories }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await assignVasInventories(trxMgr, domain, user, worksheetDetailIds, inventories)
    })
  }
}

export async function assignVasInventories(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  worksheetDetailIds: string[],
  inventories: Partial<Inventory>
): Promise<void> {
  const worksheetController: VasWorksheetController = new VasWorksheetController(trxMgr, domain, user)
  await worksheetController.assignInventories(worksheetDetailIds, inventories)
}
