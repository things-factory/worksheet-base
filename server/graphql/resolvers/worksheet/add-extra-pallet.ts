import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import { InventoryCheck, OrderInventory, OrderNoGenerator, ORDER_INVENTORY_STATUS } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory, INVENTORY_STATUS, Location } from '@things-factory/warehouse-base'
import { Brackets, SelectQueryBuilder, EntityManager, getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { WorksheetNoGenerator } from '../../../utils'

export const addExtraPalletResolver = {
  async addExtraPallet(
    _: any,
    { cycleCountNo, palletId, inspectedBatchNo, inspectedQty, inspectedWeight, locationName },
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
        locationName
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
  locationName: string
): Promise<void> {
  // Create worksheet detail
  const cycleCount: InventoryCheck = await trxMgr.getRepository(InventoryCheck).findOne({
    where: { domain, name: cycleCountNo },
    relations: ['bizplace']
  })

  const bizplace: Bizplace = cycleCount.bizplace
  const qb: SelectQueryBuilder<Inventory> = trxMgr.getRepository(Inventory).createQueryBuilder('INV')
  let inventory: Inventory = await qb
    .where('INV.domain_id = :domainId', { domainId: domain.id })
    .andWhere('INV.bizplace_id = :bizplaceId', { bizplaceId: bizplace.id })
    .andWhere('INV.palletId = :palletId', { palletId })
    .andWhere('INV.status = :status', { status: INVENTORY_STATUS.STORED })
    .andWhere(
      new Brackets(qb => {
        qb.where('"INV"."locked_qty" ISNULL')
        qb.orWhere('"INV"."locked_qty" = 0')
      })
    )
    .getOne()
  if (!inventory) throw new Error('Failed to find inventory')

  const worksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
    where: { domain, type: WORKSHEET_TYPE.CYCLE_COUNT, status: WORKSHEET_STATUS.EXECUTING, inventoryCheck: cycleCount }
  })
  const location: Location = await trxMgr.getRepository(Location).findOne({
    where: { domain, name: locationName }
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
