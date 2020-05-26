import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import { Domain } from '@things-factory/shell'
import {
  Inventory,
  InventoryHistory,
  InventoryNoGenerator,
  INVENTORY_STATUS,
  Location,
  LOCATION_STATUS
} from '@things-factory/warehouse-base'
import { EntityManager, Equal, getRepository, Not, Repository } from 'typeorm'

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

  const domain: Domain = inventory.domain
  const location: Location = inventory.location

  const seq: number = await invHistoryRepo.count({ domain: inventory.domain, palletId: inventory.palletId })
  let openingQty: number = 0
  let openingWeight: number = 0

  if (seq) {
    const lastInvHistory: InventoryHistory = await invHistoryRepo.findOne({
      domain: inventory.domain,
      palletId: inventory.palletId,
      seq: seq - 1
    })
    openingQty = lastInvHistory.openingQty + lastInvHistory.qty
    openingWeight = lastInvHistory.openingWeight + lastInvHistory.weight
  }

  let inventoryHistory: InventoryHistory = {
    ...inventory,
    name: InventoryNoGenerator.inventoryHistoryName(),
    seq,
    transactionType,
    refOrderId: refOrder.id,
    orderNo: refOrder.name,
    orderRefNo: refOrder.refNo || null,
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

  await switchLocationStatus(domain, location, user, trxMgr)
  return inventoryHistory
}

/**
 * @description: Check location emptiness and update status of location
 * @param domain
 * @param location
 * @param updater
 * @param trxMgr
 */
export async function switchLocationStatus(
  domain: Domain,
  location: Location,
  updater: User,
  trxMgr?: EntityManager
): Promise<Location> {
  const invRepo: Repository<Inventory> = trxMgr?.getRepository(Inventory) || getRepository(Inventory)
  const locationRepo: Repository<Location> = trxMgr?.getRepository(Location) || getRepository(Location)
  const allocatedItemsCnt: number = await invRepo.count({
    domain,
    status: INVENTORY_STATUS.STORED,
    location
  })

  if (!allocatedItemsCnt && location.status !== LOCATION_STATUS.EMPTY) {
    location = await locationRepo.save({
      ...location,
      status: LOCATION_STATUS.EMPTY,
      updater
    })
  } else if (allocatedItemsCnt && location.status === LOCATION_STATUS.EMPTY) {
    location = await locationRepo.save({
      ...location,
      status: LOCATION_STATUS.OCCUPIED,
      updater
    })
  }

  return location
}

export async function checkPalletDuplication(
  domain: Domain,
  bizplace: Bizplace,
  palletId: string,
  trxMgr?: EntityManager
): Promise<boolean> {
  const invRepo: Repository<Inventory> = trxMgr?.getRepository(Inventory) || getRepository(Inventory)
  const duplicatedPalletCnt: number = await invRepo.count({
    domain,
    bizplace,
    status: Not(Equal(INVENTORY_STATUS.TERMINATED)),
    palletId
  })

  return Boolean(duplicatedPalletCnt)
}
