import { User } from '@things-factory/auth-base'
import { Bizplace, getMyBizplace } from '@things-factory/biz-base'
import { OrderInventory, ORDER_INVENTORY_STATUS, ReleaseGood } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { WORKSHEET_TYPE, WORKSHEET_STATUS } from '../../../../constants'
import { LoadingWorksheetController, PickingWorksheetController } from '../../../../controllers/'
import { WorksheetController } from '../../../../controllers/worksheet-controller'
import { Worksheet, WorksheetDetail } from '../../../../entities'
import { WorksheetNoGenerator } from '../../../../utils'

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
  const targetInventories: OrderInventory[] = worksheetDetails.map((wsd: WorksheetDetail) => wsd.targetInventory)
  const pickedTargetInventories: OrderInventory[] = targetInventories
    .filter(targetInventory => targetInventory.status === ORDER_INVENTORY_STATUS.PICKED)
    .map((pickedTargetInventory: OrderInventory) => {
      return pickedTargetInventory
    })

  await pickingWSCtrl.completePicking(releaseGoodNo)

  // Find Existing Loading Worksheet if any
  let existLoadingWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
    where: {
      releaseGood,
      type: WORKSHEET_TYPE.LOADING,
      status: WORKSHEET_STATUS.DEACTIVATED
    }
  })

  if(existLoadingWorksheet) {
    const bizplace: Bizplace = await getMyBizplace(user)

    // 2) Create loading worksheet details
    let loadingWorksheetDetails = await Promise.all(
      pickedTargetInventories.map(async (targetInventory: OrderInventory) => {
        let existingLoadingWorksheetDetail: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
          where: {
            domain,
            worksheet: existLoadingWorksheet,
            targetInventory,
            type: WORKSHEET_TYPE.LOADING
          }
        })

        return existingLoadingWorksheetDetail
          ? {
              ...existingLoadingWorksheetDetail,
              status: WORKSHEET_STATUS.DEACTIVATED
            }
          : {
              domain,
              bizplace: bizplace,
              worksheet: existLoadingWorksheet,
              name: WorksheetNoGenerator.generateDetail(WORKSHEET_TYPE.LOADING),
              targetInventory,
              type: WORKSHEET_TYPE.LOADING,
              status: WORKSHEET_STATUS.DEACTIVATED,
              creator: user,
              updater: user
            }
      })
    )

    loadingWorksheetDetails = await trxMgr.getRepository(WorksheetDetail).save(loadingWorksheetDetails)
  } else {
    const loadingWSCtrl: LoadingWorksheetController = new LoadingWorksheetController(trxMgr, domain, user)
    let loadingWorksheet: Worksheet = await loadingWSCtrl.generateLoadingWorksheet(releaseGoodNo, pickedTargetInventories)

    if (!loadingWorksheet.worksheetDetails?.length) {
      loadingWorksheet = await pickingWSCtrl.findWorksheetById(loadingWorksheet.id)
    }

    const loadingWorksheetDetails: WorksheetDetail[] = loadingWorksheet.worksheetDetails
    await loadingWSCtrl.activateLoading(loadingWorksheet.name, loadingWorksheetDetails)
  }

  
}
