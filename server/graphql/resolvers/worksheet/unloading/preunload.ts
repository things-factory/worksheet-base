import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { UnloadingWorksheetController } from '../../../../controllers'

export const preunloadResolver = {
  async preunload(_: any, { worksheetDetailName, adjustedBatchId, adjustedPalletQty, palletQty }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await preunload(trxMgr, domain, user, worksheetDetailName, adjustedBatchId, adjustedPalletQty, palletQty)
    })
  }
}

export async function preunload(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  worksheetDetailName: string,
  adjustedBatchId: string,
  adjustedPalletQty: number,
  palletQty: number
): Promise<void> {
  const worksheetController: UnloadingWorksheetController = new UnloadingWorksheetController(trxMgr, domain, user)
  await worksheetController.preunload(worksheetDetailName, adjustedBatchId, adjustedPalletQty, palletQty)
}
