import { User } from '@things-factory/auth-base'
import { DeliveryOrder } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { LoadingWorksheetController } from '../../../../controllers'

export const undoLoadingResolver = {
  async undoLoading(_: any, { deliveryOrder, palletIds }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await undoLoading(trxMgr, domain, user, deliveryOrder, palletIds)
    })
  }
}

export async function undoLoading(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  deliveryOrder: Partial<DeliveryOrder>,
  palletIds: string[]
): Promise<void> {
  const worksheetController: LoadingWorksheetController = new LoadingWorksheetController(trxMgr, domain, user)
  await worksheetController.undoLoading(deliveryOrder, palletIds)
}
