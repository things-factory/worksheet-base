import { Domain } from '@things-factory/shell'
import { User } from '@things-factory/auth-base'
import { Location, Inventory, LOCATION_STATUS, INVENTORY_STATUS } from '@things-factory/warehouse-base'
import { getRepository, Repository, EntityManager } from 'typeorm'

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
  } else if (allocatedItemsCnt && location.state === LOCATION_STATUS.EMPTY) {
    location = await locationRepo.save({
      ...location,
      status: LOCATION_STATUS.OCCUPIED,
      updater
    })
  }

  return location
}
