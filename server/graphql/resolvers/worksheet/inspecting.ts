import { User } from '@things-factory/auth-base'
import { OrderInventory, ORDER_INVENTORY_STATUS } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory, Location } from '@things-factory/warehouse-base'
import { EntityManager, getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { WorksheetDetail } from '../../../entities'

export const inspectingResolver = {
  async inspecting(_: any, { worksheetDetailName, inspectedBatchNo, inspectedQty, inspectedWeight }, context: any) {
    return await getManager().transaction(async (trxMgr: EntityManager) => {
      const { domain, user }: { domain: Domain; user: User } = context.state

      await inspecting(trxMgr, domain, user, worksheetDetailName, inspectedBatchNo, inspectedQty, inspectedWeight)
    })
  }
}

export async function inspecting(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  worksheetDetailName: string,
  inspectedBatchNo: string,
  inspectedQty: number,
  inspectedWeight: number
) {
  let worksheetDetail: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
    where: {
      domain,
      name: worksheetDetailName,
      status: WORKSHEET_STATUS.EXECUTING,
      type: WORKSHEET_TYPE.CYCLE_COUNT
    },
    relations: ['targetInventory', 'targetInventory.inventory']
  })
  if (!worksheetDetail) throw new Error(`Worksheet Details doesn't exists`)

  let targetInventory: OrderInventory = worksheetDetail.targetInventory
  const inventory: Inventory = targetInventory.inventory
  const { batchId, qty, weight }: { batchId: string; qty: number; weight: number } = inventory

  const isChanged: boolean = batchId !== inspectedBatchNo || qty !== inspectedQty || weight !== inspectedWeight
  const worksheetDetailStatus: string = isChanged ? WORKSHEET_STATUS.NOT_TALLY : WORKSHEET_STATUS.DONE
  const targetInventoryStatus: string = isChanged ? ORDER_INVENTORY_STATUS.NOT_TALLY : ORDER_INVENTORY_STATUS.INSPECTED

  worksheetDetail.status = worksheetDetailStatus
  worksheetDetail.updater = user
  await trxMgr.getRepository(WorksheetDetail).save(worksheetDetail)

  targetInventory.inspectedBatchNo = inspectedBatchNo
  targetInventory.inspectedQty = inspectedQty
  targetInventory.inspectedWeight = inspectedWeight
  targetInventory.status = targetInventoryStatus
  targetInventory.updater = user
  await trxMgr.getRepository(OrderInventory).save(targetInventory)
}
