import { User } from '@things-factory/auth-base'
import { Inventory, InventoryHistory, InventoryNoGenerator } from '@things-factory/warehouse-base'
import { EntityManager, getRepository, Repository } from 'typeorm'

/**
 * @description It will insert new record into inventory histories table.
 * seq will be calculated based on number of records for one specific pallet id (provided by inventory object)
 */
export async function generateInventoryHistory(
  inventory: Inventory,
  refOrder: any,
  transactionType: string,
  qty: number,
  weight: number,
  user: User,
  trxMgr?: EntityManager
): Promise<InventoryHistory> {
  const invHistoryRepo: Repository<InventoryHistory> =
    trxMgr?.getRepository(InventoryHistory) || getRepository(InventoryHistory)
  const invRepo: Repository<Inventory> = trxMgr?.getRepository(Inventory) || getRepository(Inventory)

  if (!inventory?.id) throw new Error(`Can't find out ID of inventory.`)
  if (!refOrder?.id || !refOrder.name) throw new Error(`Can't find out ID or Name of Reference Order`)
  if (
    !inventory?.domain ||
    !inventory?.bizplace ||
    !inventory?.product?.id ||
    !inventory?.warehouse?.id ||
    !inventory?.location?.id
  ) {
    inventory = await invRepo.findOne({
      where: { id: inventory.id },
      relations: ['domain', 'bizplace', 'product', 'warehouse', 'location']
    })
  }

  const seq: number = await invHistoryRepo.count({ domain: inventory.domain, palletId: inventory.palletId })
  let openingQty: number = 0
  let openingWeight: number = 0

  if (seq) {
    openingQty = inventory.qty + qty
    openingWeight = inventory.weight + weight
  }

  let inventoryHistory: InventoryHistory = {
    ...inventory,
    name: InventoryNoGenerator.inventoryHistoryName(),
    seq,
    transactionType,
    refOrderId: refOrder.id,
    orderNo: refOrder.name,
    productId: inventory.product.id,
    warehouseId: inventory.warehouse.id,
    locationId: inventory.location.id,
    qty,
    openingQty,
    weight,
    openingWeight,
    creator: user,
    updater: user
  }
  delete inventoryHistory.id
  inventoryHistory = await invHistoryRepo.save(inventoryHistory)

  if (inventory.lastSeq !== seq) {
    await invRepo.save({
      ...inventory,
      lastSeq: inventoryHistory.seq,
      updater: user
    })
  }

  return inventoryHistory
}
