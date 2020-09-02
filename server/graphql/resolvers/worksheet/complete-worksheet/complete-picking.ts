import { User } from '@things-factory/auth-base'
import { Bizplace, getMyBizplace } from '@things-factory/biz-base'
import { OrderInventory, ORDER_INVENTORY_STATUS, ReleaseGood } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { WORKSHEET_TYPE } from '../../../../constants'
import { OutboundWorksheetController } from '../../../../controllers/outbound-worksheet-controller'
import { WorksheetController } from '../../../../controllers/worksheet-controller'
import { Worksheet, WorksheetDetail } from '../../../../entities'

export const completePickingResolver = {
  async completePicking(_: any, { releaseGoodNo }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state

      await completePicking(trxMgr, domain, user, releaseGoodNo)

      const bizplace: Bizplace = await getMyBizplace(user)
      const worksheetController: WorksheetController = new WorksheetController(trxMgr)
      await worksheetController.notifyToCustomer(domain, bizplace, {
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
  const worksheetController: OutboundWorksheetController = new OutboundWorksheetController(trxMgr)
  const releaseGood: ReleaseGood = await worksheetController.findRefOrder(ReleaseGood, { domain, name: releaseGoodNo })
  const worksheet: Worksheet = await worksheetController.findWorksheetByRefOrder(
    domain,
    releaseGood,
    WORKSHEET_TYPE.PICKING,
    ['worksheetDetails', 'worksheetDetails.targetInventories']
  )

  const worksheetDetails: WorksheetDetail[] = worksheet.worksheetDetails
  const pickedTargetInventories: OrderInventory[] = worksheetDetails.map(
    (wsd: WorksheetDetail) => wsd.targetInventory.status === ORDER_INVENTORY_STATUS.PICKED
  )

  await worksheetController.completePicking({ domain, user, releaseGoodNo })
  let loadingWorksheet: Worksheet = await worksheetController.generateLoadingWorksheet({
    domain,
    user,
    releaseGoodNo,
    targetInventories: pickedTargetInventories
  })

  if (!loadingWorksheet.worksheetDetails?.length) {
    loadingWorksheet = await worksheetController.findWorksheetById(loadingWorksheet.id)
  }

  const loadingWorksheetDetails: WorksheetDetail[] = loadingWorksheet.worksheetDetails
  await worksheetController.activateLoading({
    domain,
    user,
    worksheetNo: loadingWorksheet.name,
    loadingWorksheetDetails
  })
}
