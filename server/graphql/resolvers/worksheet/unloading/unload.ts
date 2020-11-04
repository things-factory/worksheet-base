import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { Inventory } from '@things-factory/warehouse-base'
import { EntityManager, getManager } from 'typeorm'
import { UnloadingWorksheetController } from '../../../../controllers'

export const unloadResolver = {
  async unload(_: any, { worksheetDetailName, inventory }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await unload(trxMgr, domain, user, worksheetDetailName, inventory)
    })
  }
}

async function unload(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  worksheetDetailName: string,
  inventory: Partial<Inventory>
): Promise<void> {
  const worksheetController: UnloadingWorksheetController = new UnloadingWorksheetController(trxMgr, domain, user)
  await worksheetController.unload(worksheetDetailName, inventory)
}
