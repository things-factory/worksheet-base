import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import { OrderInventory, ORDER_INVENTORY_STATUS, ORDER_STATUS, ReleaseGood } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager, getRepository } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const activateLoadingResolver = {
  async activateLoading(_: any, { worksheetNo, loadingWorksheetDetails }, context: any) {
    return await getManager().transaction(async trxMgr => {
      return await activateLoading(worksheetNo, loadingWorksheetDetails, context.state.domain, context.state.user)
    })
  }
}

export async function activateLoading(
  worksheetNo: any,
  loadingWorksheetDetails: any,
  domain: Domain,
  user: User,
  trxMgr?: EntityManager
): Promise<Worksheet> {
  /**
   * 1. Validation for worksheet
   *    - data existing
   *    - status of worksheet
   */

  const repository = trxMgr ? trxMgr.getRepository : getRepository

  const foundWorksheet: Worksheet = await repository(Worksheet).findOne({
    where: {
      domain,
      name: worksheetNo,
      type: WORKSHEET_TYPE.LOADING,
      status: WORKSHEET_STATUS.DEACTIVATED
    },
    relations: ['bizplace', 'releaseGood', 'worksheetDetails', 'worksheetDetails.targetInventory']
  })

  if (!foundWorksheet) throw new Error(`Worksheet doesn't exists`)
  const customerBizplace: Bizplace = foundWorksheet.bizplace
  const foundWSDs: WorksheetDetail[] = foundWorksheet.worksheetDetails
  let targetInventories: OrderInventory[] = foundWSDs.map((foundWSD: WorksheetDetail) => foundWSD.targetInventory)

  /**
   * 2. Update description and status of loading worksheet details (status: DEACTIVATED => EXECUTING)
   */
  await Promise.all(
    loadingWorksheetDetails.map(async (loadingWorksheetDetail: WorksheetDetail) => {
      await repository(WorksheetDetail).update(
        {
          domain,
          bizplace: customerBizplace,
          name: loadingWorksheetDetail.name,
          status: WORKSHEET_STATUS.DEACTIVATED
        },
        {
          description: loadingWorksheetDetail.description,
          status: WORKSHEET_STATUS.EXECUTING,
          updater: user
        }
      )
    })
  )

  /**
   * 3. Update target inventories (status: PICKING => LOADING)
   */
  targetInventories = targetInventories.map((targetInventory: OrderInventory) => {
    return {
      ...targetInventory,
      status: ORDER_INVENTORY_STATUS.LOADING,
      updater: user
    }
  })
  await repository(OrderInventory).save(targetInventories)

  /**
   * 4. Update loading Worksheet (status: DEACTIVATED => EXECUTING)
   */
  const worksheet: Worksheet = await repository(Worksheet).save({
    ...foundWorksheet,
    status: WORKSHEET_STATUS.EXECUTING,
    startedAt: new Date(),
    updater: user
  })

  /**
   * 5. Update Release Good (status: READY_TO_PICK => PICKING)
   */
  const releaseGood: ReleaseGood = foundWorksheet.releaseGood
  await repository(ReleaseGood).save({
    ...releaseGood,
    status: ORDER_STATUS.LOADING,
    updater: user
  })

  return worksheet
}
