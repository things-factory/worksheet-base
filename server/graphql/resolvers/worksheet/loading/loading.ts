import { User } from '@things-factory/auth-base'
import { generateDeliveryOrder, OrderInventory, ORDER_INVENTORY_STATUS, ReleaseGood } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { LoadingWorksheetController } from '../../../../controllers'
import { WorksheetDetail } from '../../../../entities'

type OrderInfo = {
  name: string
  description: string
  type: string
  worksheetDetails: Partial<WorksheetDetail>[]
  initialBatchId: string
  status: string
  truckNo: string
  palletQty: string
  ownCollection: boolean
}

export const loadingResolver = {
  async loading(_: any, { worksheetDetails, releaseGoodNo, orderInfo }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await loading(trxMgr, domain, user, worksheetDetails, releaseGoodNo)
    })
  }
}

export async function loading(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  releaseGoodNo: string,
  worksheetDetails: Partial<WorksheetDetail & { loadedQty: number }>[]
): Promise<void> {
  const worksheetController: LoadingWorksheetController = new LoadingWorksheetController(trxMgr, domain, user)
  await worksheetController.loading(releaseGoodNo, worksheetDetails)

  const releaseGood: ReleaseGood = await worksheetController.findRefOrder(
    ReleaseGood,
    { domain: this.domain, name: releaseGoodNo },
    ['orderInventories']
  )
  const targetInventories: OrderInventory[] = releaseGood.orderInventories.filter(
    (orderInventory: OrderInventory) => (orderInventory.status = ORDER_INVENTORY_STATUS.LOADED)
  )
  await generateDeliveryOrder(
    worksheetDetails,
    targetInventories,
    releaseGood.bizplace,
    releaseGood,
    domain,
    user,
    trxMgr
  )
}
