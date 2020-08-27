import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import { OrderInventory, ORDER_INVENTORY_STATUS } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager, getRepository, Repository } from 'typeorm'
import { WORKSHEET_STATUS } from '../../../../constants'
import { Worksheet, WorksheetDetail } from '../../../../entities'

export const activateReturnResolver = {
  async activateReturn(_: any, { worksheetNo, returnWorksheetDetails }, context: any) {
    return await getManager().transaction(async trxMgr => {
      return await activateReturn(worksheetNo, returnWorksheetDetails, context.state.domain, context.state.user, trxMgr)
    })
  }
}
export async function activateReturn(
  worksheetNo: any,
  returnWorksheetDetails: any,
  domain: Domain,
  user: User,
  trxMgr?: EntityManager
): Promise<Worksheet> {
  const worksheetRepo: Repository<Worksheet> = trxMgr ? trxMgr.getRepository(Worksheet) : getRepository(Worksheet)
  const worksheetDetailRepo: Repository<WorksheetDetail> = trxMgr
    ? trxMgr.getRepository(WorksheetDetail)
    : getRepository(WorksheetDetail)
  const orderInventoryRepo: Repository<OrderInventory> = trxMgr
    ? trxMgr.getRepository(OrderInventory)
    : getRepository(OrderInventory)

  const foundWorksheet: Worksheet = await worksheetRepo.findOne({
    where: {
      domain,
      name: worksheetNo,
      status: WORKSHEET_STATUS.DEACTIVATED
    },
    relations: ['bizplace', 'releaseGood', 'worksheetDetails', 'worksheetDetails.targetInventory']
  })

  if (!foundWorksheet) throw new Error(`Worksheet doesn't exists`)
  const customerBizplace: Bizplace = foundWorksheet.bizplace
  const foundWSDs: WorksheetDetail[] = foundWorksheet.worksheetDetails
  let targetInventories: OrderInventory[] = foundWSDs.map((foundWSD: WorksheetDetail) => foundWSD.targetInventory)

  /**
   * 2. Update description of putaway worksheet details
   */
  await Promise.all(
    returnWorksheetDetails.map(async (returnWorksheetDetail: WorksheetDetail) => {
      await worksheetDetailRepo.update(
        {
          domain,
          bizplace: customerBizplace,
          name: returnWorksheetDetail.name,
          status: WORKSHEET_STATUS.DEACTIVATED
        },
        {
          description: returnWorksheetDetail.description,
          status: WORKSHEET_STATUS.EXECUTING,
          updater: user
        }
      )
    })
  )

  /**
   * 3. Update target inventories (status: READY_TO_PUTAWAY => PUTTING_AWAY)
   */
  targetInventories = targetInventories.map((targetInventory: OrderInventory) => {
    return {
      ...targetInventory,
      status: ORDER_INVENTORY_STATUS.RETURNING,
      updater: user
    }
  })
  await orderInventoryRepo.save(targetInventories)

  /**
   * 4. Update return Worksheet (status: DEACTIVATED => EXECUTING)
   */
  const worksheet: Worksheet = await worksheetRepo.save({
    ...foundWorksheet,
    status: WORKSHEET_STATUS.EXECUTING,
    startedAt: new Date(),
    updater: user
  })

  /**
   * 5. TODO: Create return order to track all return goods
   */

  return worksheet
}
