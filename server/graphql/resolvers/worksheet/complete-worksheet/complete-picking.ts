import { User } from '@things-factory/auth-base'
import { Bizplace, getMyBizplace } from '@things-factory/biz-base'
import { OrderInventory, ORDER_INVENTORY_STATUS, ORDER_STATUS, ReleaseGood } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { WorksheetController } from 'server/controllers/worksheet-controller'
import { EntityManager, getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../../constants'
import { Worksheet, WorksheetDetail } from '../../../../entities'
import { WorksheetNoGenerator } from '../../../../utils'
import { activateLoading } from '../activate-worksheet/activate-loading'

export const completePickingResolver = {
  async completePicking(_: any, { releaseGoodNo }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state

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
  const releaseGood: ReleaseGood = await trxMgr.getRepository(ReleaseGood).findOne({
    where: { domain, name: releaseGoodNo, status: ORDER_STATUS.PICKING },
    relations: ['bizplace', 'orderInventories']
  })

  if (!releaseGood) throw new Error(`Release Good doesn't exists.`)
  const customerBizplace: Bizplace = releaseGood.bizplace
  const foundPickingWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
    where: {
      domain,
      bizplace: customerBizplace,
      status: WORKSHEET_STATUS.EXECUTING,
      type: WORKSHEET_TYPE.PICKING,
      releaseGood
    },
    relations: ['worksheetDetails', 'worksheetDetails.targetInventory', 'worksheetDetails.targetInventory.inventory']
  })

  if (!foundPickingWorksheet) throw new Error(`Worksheet doesn't exists.`)
  const worksheetDetails: WorksheetDetail[] = foundPickingWorksheet.worksheetDetails
  const targetInventories: OrderInventory[] = worksheetDetails.map((wsd: WorksheetDetail) => wsd.targetInventory)

  // filter out replaced inventory
  const pickedtargetInv: OrderInventory[] = targetInventories.filter(
    (targetInv: OrderInventory) => targetInv.status === ORDER_INVENTORY_STATUS.PICKED
  )

  // Update status and endedAt of worksheet
  await trxMgr.getRepository(Worksheet).save({
    ...foundPickingWorksheet,
    status: WORKSHEET_STATUS.DONE,
    endedAt: new Date(),
    updater: user
  })

  // 3. create loading worksheet
  const loadingWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).save({
    domain,
    releaseGood,
    bizplace: customerBizplace,
    name: WorksheetNoGenerator.loading(),
    type: WORKSHEET_TYPE.LOADING,
    status: WORKSHEET_STATUS.DEACTIVATED,
    creator: user,
    updater: user
  })

  // 2) Create loading worksheet details
  let loadingWorksheetDetails = pickedtargetInv.map((targetInventory: OrderInventory) => {
    return {
      domain,
      bizplace: customerBizplace,
      worksheet: loadingWorksheet,
      name: WorksheetNoGenerator.loadingDetail(),
      targetInventory,
      type: WORKSHEET_TYPE.LOADING,
      status: WORKSHEET_STATUS.DEACTIVATED,
      creator: user,
      updater: user
    }
  })
  loadingWorksheetDetails = await trxMgr.getRepository(WorksheetDetail).save(loadingWorksheetDetails)

  await activateLoading(trxMgr, domain, user, loadingWorksheet.name, loadingWorksheetDetails)

  // 3. update status of release good
  await trxMgr.getRepository(ReleaseGood).save({
    ...releaseGood,
    status: ORDER_STATUS.LOADING,
    updater: user
  })
}
