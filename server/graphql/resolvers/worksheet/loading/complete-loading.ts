import { User } from '@things-factory/auth-base'
import { OrderInventory, ORDER_INVENTORY_STATUS, ORDER_STATUS, ReleaseGood } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { WORKSHEET_TYPE } from '../../../../constants'
import { LoadingWorksheetController, ReturningWorksheetController } from '../../../../controllers'
import { Worksheet, WorksheetDetail } from '../../../../entities'

export const completeLoadingResolver = {
  async completeLoading(_: any, { releaseGoodNo }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await completeLoading(trxMgr, domain, user, releaseGoodNo)
    })
  }
}

export async function completeLoading(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  releaseGoodNo: string
): Promise<void> {
  const worksheetController: LoadingWorksheetController = new LoadingWorksheetController(trxMgr, domain, user)
  const releaseGood: ReleaseGood = await worksheetController.findRefOrder(ReleaseGood, {
    domain,
    name: releaseGoodNo,
    status: ORDER_STATUS.LOADING
  })
  const worksheet: Worksheet = await worksheetController.findWorksheetByRefOrder(releaseGood, WORKSHEET_TYPE.LOADING, [
    'worksheetDetails',
    'worksheetDetails.targetInventory'
  ])
  const worksheetDetails: WorksheetDetail[] = worksheet.worksheetDetails
  const targetInventories: OrderInventory[] = worksheetDetails.map((wsd: WorksheetDetail) => wsd.targetInventory)
  const remainInventories: OrderInventory[] = targetInventories.filter(
    (targetInventory: OrderInventory) => targetInventory.status === ORDER_INVENTORY_STATUS.LOADING
  )

  await worksheetController.completeLoading(releaseGoodNo)

  if (remainInventories.length) {
    await createReturnWorksheet(trxMgr, domain, user, releaseGoodNo, remainInventories)
  }
}

// Generating worksheet for returning process
export async function createReturnWorksheet(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  releaseGoodNo: string,
  orderInventories: OrderInventory[]
): Promise<Worksheet> {
  const worksheetController: ReturningWorksheetController = new ReturningWorksheetController(trxMgr, domain, user)
  return await worksheetController.generateReturningWorksheet(releaseGoodNo, orderInventories)
}
