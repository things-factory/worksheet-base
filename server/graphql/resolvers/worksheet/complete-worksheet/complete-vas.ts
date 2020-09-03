import { User } from '@things-factory/auth-base'
import { ArrivalNotice, ORDER_TYPES, ReleaseGood } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { WORKSHEET_TYPE } from '../../../../constants'
import { LoadingWorksheetController, PutawayWorksheetController, VasWorksheetController } from '../../../../controllers'
import { Worksheet, WorksheetDetail } from '../../../../entities'

export const completeVasResolver = {
  async completeVas(_: any, { orderNo, orderType }, context: any) {
    return await getManager().transaction(async (trxMgr: EntityManager) => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await completeVAS(trxMgr, domain, user, orderNo, orderType)
    })
  }
}

export async function completeVAS(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  orderNo: string,
  orderType: string
): Promise<Worksheet> {
  const worksheetController: VasWorksheetController = new VasWorksheetController(trxMgr)
  let worksheet: Worksheet = await worksheetController.completeVAS({ domain, user, orderNo, orderType })

  if (orderType === ORDER_TYPES.ARRIVAL_NOTICE) {
    if (!worksheet.worksheetDetails?.length || !worksheet.arrivalNotice?.id) {
      worksheet = await worksheetController.findWorksheetById(worksheet.id, ['worksheetDetails', 'arrivalNotice'])
    }

    const arrivalNotice: ArrivalNotice = worksheet.arrivalNotice
    await activatePutawayWorksheet(trxMgr, domain, user, arrivalNotice)
  } else if (orderType === ORDER_TYPES.RELEASE_OF_GOODS) {
    if (!worksheet.worksheetDetails?.length || !worksheet.releaseGood?.id) {
      worksheet = await worksheetController.findWorksheetById(worksheet.id, ['worksheetDetails', 'releaseGood'])
    }

    const releaseGood: ReleaseGood = worksheet.releaseGood
    await activateLoadingWorksheet(trxMgr, domain, user, releaseGood)
  }

  return worksheet
}

async function activatePutawayWorksheet(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  arrivalNotice: ArrivalNotice
): Promise<void> {
  const worksheetController: PutawayWorksheetController = new PutawayWorksheetController(trxMgr, domain, user)
  const worksheet: Worksheet = await worksheetController.findWorksheetByRefOrder(arrivalNotice, WORKSHEET_TYPE.PUTAWAY)
  const worksheetNo: string = worksheet.name
  const putawayWorksheetDetails: WorksheetDetail[] = worksheet.worksheetDetails
  await worksheetController.activatePutaway(worksheetNo, putawayWorksheetDetails)
}

async function activateLoadingWorksheet(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  releaseGood: ReleaseGood
): Promise<void> {
  const worksheetController: LoadingWorksheetController = new LoadingWorksheetController(trxMgr, domain, user)
  const worksheet: Worksheet = await worksheetController.findWorksheetByRefOrder(releaseGood, WORKSHEET_TYPE.LOADING)
  const worksheetNo: string = worksheet.name
  const loadingWorksheetDetails: WorksheetDetail[] = worksheet.worksheetDetails
  await worksheetController.activateLoading(worksheetNo, loadingWorksheetDetails)
}
