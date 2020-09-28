import { User } from '@things-factory/auth-base'
import { OrderInventory, ORDER_INVENTORY_STATUS } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager, Not } from 'typeorm'
import { WORKSHEET_STATUS } from '../../../constants'
import { WorksheetDetail } from '../../../entities'

export const undoInspectionResolver = {
  async undoInspection(_: any, { worksheetDetailName }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await undoInspection(trxMgr, domain, user, worksheetDetailName)
    })
  }
}

export async function undoInspection(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  worksheetDetailName: string
): Promise<void> {
  let worksheetDetail: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
    where: { domain, name: worksheetDetailName, status: Not(WORKSHEET_STATUS.EXECUTING) },
    relations: ['targetInventory']
  })
  let targetInventory: OrderInventory = worksheetDetail.targetInventory

  worksheetDetail.status = WORKSHEET_STATUS.EXECUTING
  worksheetDetail.updater = user
  await trxMgr.getRepository(WorksheetDetail).save(worksheetDetail)
  targetInventory.status = ORDER_INVENTORY_STATUS.INSPECTING
  targetInventory.inspectedBatchNo = null
  targetInventory.inspectedQty = null
  targetInventory.inspectedWeight = null
  targetInventory.inspectedLocation = null
  targetInventory.updater = user
  await trxMgr.getRepository(OrderInventory).save(targetInventory)
}
