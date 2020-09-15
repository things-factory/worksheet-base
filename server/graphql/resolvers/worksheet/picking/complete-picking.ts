import { User } from '@things-factory/auth-base'
import { Bizplace, getMyBizplace } from '@things-factory/biz-base'
import { OrderInventory, ORDER_INVENTORY_STATUS, ReleaseGood } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { WORKSHEET_TYPE } from '../../../../constants'
import { LoadingWorksheetController, PickingWorksheetController } from '../../../../controllers/'
import { WorksheetController } from '../../../../controllers/worksheet-controller'
import { Worksheet, WorksheetDetail } from '../../../../entities'

export const completePickingResolver = {
  async completePicking(_: any, { releaseGoodNo }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state

      await completePicking(trxMgr, domain, user, releaseGoodNo)

      const bizplace: Bizplace = await getMyBizplace(user)
      const worksheetController: WorksheetController = new WorksheetController(trxMgr, domain, user)
      await worksheetController.notifyToCustomer(bizplace, {
        title: `Picking has been completed`,
        message: `Items now are ready to be loaded`,
        url: context.header.referer
      })
    })
  }
}

export async function completePicking(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  releaseGoodNo: string
): Promise<void> {
  const pickingWSCtrl: PickingWorksheetController = new PickingWorksheetController(trxMgr, domain, user)
  const releaseGood: ReleaseGood = await pickingWSCtrl.findRefOrder(ReleaseGood, {
    domain,
    name: releaseGoodNo
  })
  const worksheet: Worksheet = await pickingWSCtrl.findWorksheetByRefOrder(releaseGood, WORKSHEET_TYPE.PICKING, [
    'worksheetDetails',
    'worksheetDetails.targetInventory'
  ])

  const worksheetDetails: WorksheetDetail[] = worksheet.worksheetDetails
  const pickedTargetInventories: OrderInventory[] = worksheetDetails.map((wsd: WorksheetDetail) => {
    if (wsd.targetInventory.status === ORDER_INVENTORY_STATUS.PICKED) {
      return wsd.targetInventory
    }
  })

  await pickingWSCtrl.completePicking(releaseGoodNo)

  const loadingWSCtrl: LoadingWorksheetController = new LoadingWorksheetController(trxMgr, domain, user)
  let loadingWorksheet: Worksheet = await loadingWSCtrl.generateLoadingWorksheet(releaseGoodNo, pickedTargetInventories)

  if (!loadingWorksheet.worksheetDetails?.length) {
    loadingWorksheet = await pickingWSCtrl.findWorksheetById(loadingWorksheet.id)
  }

  const loadingWorksheetDetails: WorksheetDetail[] = loadingWorksheet.worksheetDetails
  await loadingWSCtrl.activateLoading(loadingWorksheet.name, loadingWorksheetDetails)
}
