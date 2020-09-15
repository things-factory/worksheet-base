import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import { generateDeliveryOrder, OrderInventory, ORDER_INVENTORY_STATUS, ReleaseGood } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { LoadingWorksheetController, WorksheetController } from '../../../../controllers'
import { WorksheetDetail } from '../../../../entities'

export const loadingResolver = {
  async loading(_: any, { loadedWorksheetDetails, releaseGoodNo, orderInfo }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await loading(trxMgr, domain, user, loadedWorksheetDetails, releaseGoodNo)
      const worksheetController: WorksheetController = new WorksheetController(trxMgr, domain, user)
      const releaseGood: ReleaseGood = await worksheetController.findRefOrder(
        ReleaseGood,
        { domain, name: releaseGoodNo },
        ['bizplace', 'orderInventories']
      )

      const bizplace: Bizplace = releaseGood.bizplace
      const targetInventories: OrderInventory[] = releaseGood.orderInventories.filter(
        (oi: OrderInventory) => oi.status === ORDER_INVENTORY_STATUS.LOADED
      )
      await generateDeliveryOrder(orderInfo, targetInventories, bizplace, releaseGood, domain, user, trxMgr)
    })
  }
}

export async function loading(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  worksheetDetails: Partial<WorksheetDetail & { loadedQty: number }>[],
  releaseGoodNo: string
): Promise<void> {
  const worksheetController: LoadingWorksheetController = new LoadingWorksheetController(trxMgr, domain, user)
  await worksheetController.loading(releaseGoodNo, worksheetDetails)
}
