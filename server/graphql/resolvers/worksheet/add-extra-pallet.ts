import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import { InventoryCheck, OrderInventory, OrderNoGenerator, ORDER_INVENTORY_STATUS } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory, Location } from '@things-factory/warehouse-base'
import { EntityManager, getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { WorksheetNoGenerator } from '../../../utils'

export const addExtraPalletResolver = {
  async addExtraPallet(
    _: any,
    { cycleCountNo, palletId, inspectedBatchNo, inspectedQty, inspectedWeight, locationId },
    context: any
  ): Promise<void> {
    return getManager().transaction(async (trxMgr: EntityManager) => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await addExtraPallet(
        trxMgr,
        domain,
        user,
        cycleCountNo,
        palletId,
        inspectedBatchNo,
        inspectedQty,
        inspectedWeight,
        locationId
      )
    })
  }
}

export async function addExtraPallet(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  cycleCountNo: string,
  palletId: string,
  inspectedBatchNo: string,
  inspectedQty: number,
  inspectedWeight: number,
  locationId: string
): Promise<void> {
  // Create worksheet detail
  const cycleCount: InventoryCheck = await trxMgr.getRepository(InventoryCheck).findOne({
    where: { domain, name: cycleCountNo },
    relations: ['bizplace']
  })

  const bizplace: Bizplace = cycleCount.bizplace
  const inventory: Inventory = await trxMgr.getRepository(Inventory).findOne({
    where: { domain, palletId, bizplace }
  })
  if (!inventory) throw new Error('Failed to find inventory')

  const worksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
    where: { domain, type: WORKSHEET_TYPE.CYCLE_COUNT, status: WORKSHEET_STATUS.EXECUTING, inventoryCheck: cycleCount }
  })
  const location: Location = await trxMgr.getRepository(Location).findOne({
    where: { domain, id: locationId }
  })

  let targetInventory: OrderInventory = new OrderInventory()
  targetInventory.domain = domain
  targetInventory.bizplace = bizplace
  targetInventory.status = ORDER_INVENTORY_STATUS.ADDED
  targetInventory.name = OrderNoGenerator.orderInventory()
  targetInventory.inventoryCheck = cycleCount
  targetInventory.inventory = inventory
  targetInventory.inspectedBatchNo = inspectedBatchNo
  targetInventory.inspectedQty = inspectedQty
  targetInventory.inspectedWeight = inspectedWeight
  targetInventory.inspectedLocation = location
  targetInventory.creator = user
  targetInventory.updater = user
  await trxMgr.getRepository(OrderInventory).save(targetInventory)

  let worksheetDetail: WorksheetDetail = new WorksheetDetail()
  worksheetDetail.domain = domain
  worksheetDetail.bizplace = bizplace
  worksheetDetail.worksheet = worksheet
  worksheetDetail.name = WorksheetNoGenerator.cycleCountDetail()
  worksheetDetail.targetInventory = targetInventory
  worksheetDetail.type = WORKSHEET_TYPE.CYCLE_COUNT
  worksheetDetail.status = WORKSHEET_STATUS.NOT_TALLY
  worksheetDetail.creator = user
  worksheetDetail.updater = user
  await trxMgr.getRepository(WorksheetDetail).save(worksheetDetail)
}
