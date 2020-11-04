import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { Inventory } from '@things-factory/warehouse-base'
import { EntityManager, getManager } from 'typeorm'
import { UnloadingReturningWorksheetController } from '../../../../controllers'

export const unloadReturnResolver = {
  async unloadReturn(_: any, { worksheetDetailName, inventory }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await unloadReturn(trxMgr, domain, user, worksheetDetailName, inventory)
    })
  }
}

async function unloadReturn(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  worksheetDetailName: string,
  inventory: Partial<Inventory>
): Promise<void> {
  const worksheetController: UnloadingReturningWorksheetController = new UnloadingReturningWorksheetController(
    trxMgr,
    domain,
    user
  )
  await worksheetController.unloadReturning(worksheetDetailName, inventory)
}
