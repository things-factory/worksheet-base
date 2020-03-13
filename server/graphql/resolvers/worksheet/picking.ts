import { OrderInventory, ORDER_INVENTORY_STATUS } from '@things-factory/sales-base'
import { Inventory, INVENTORY_STATUS, INVENTORY_TRANSACTION_TYPE, Location } from '@things-factory/warehouse-base'
import { EntityManager, getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { WorksheetDetail } from '../../../entities'
import { generateInventoryHistory, switchLocationStatus } from '../../../utils'
import { Domain } from '@things-factory/shell'
import { User } from '@things-factory/auth-base'

export const picking = {
  async picking(_: any, { worksheetDetailName, palletId, locationName, releaseQty }, context: any) {
    return await getManager().transaction(async trxMgr => {
      await executePikcing(
        worksheetDetailName,
        palletId,
        locationName,
        releaseQty,
        context.state.domain,
        context.state.user,
        trxMgr
      )
    })
  }
}

export async function executePikcing(
  worksheetDetailName: string,
  palletId: string,
  locationName: string,
  releaseQty: number,
  domain: Domain,
  user: User,
  trxMgr: EntityManager
) {
  // get worksheet detail
  const worksheetDetail: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
    where: {
      domain,
      name: worksheetDetailName,
      status: WORKSHEET_STATUS.EXECUTING,
      type: WORKSHEET_TYPE.PICKING
    },
    relations: [
      'worksheet',
      'worksheet.releaseGood',
      'targetInventory',
      'targetInventory.inventory',
      'targetInventory.inventory.bizplace',
      'targetInventory.inventory.product',
      'targetInventory.inventory.warehouse',
      'targetInventory.inventory.location'
    ]
  })
  if (!worksheetDetail) throw new Error(`Worksheet Details doesn't exists`)

  // get location by name
  const fromLocation: Location = worksheetDetail.targetInventory.inventory.location
  const toLocation: Location = await trxMgr.getRepository(Location).findOne({
    where: { domain, name: locationName },
    relations: ['warehouse']
  })
  if (!toLocation) throw new Error(`Location doesn't exists`)

  let targetInventory: OrderInventory = worksheetDetail.targetInventory
  let inventory: Inventory = targetInventory.inventory

  if (inventory.palletId !== palletId) throw new Error('Pallet ID is invalid')
  const leftQty: number = inventory.qty - releaseQty
  if (leftQty < 0) throw new Error(`Invalid qty, can't exceed limitation`)

  // Change status of order inventory
  await trxMgr.getRepository(OrderInventory).save({
    ...targetInventory,
    status: ORDER_INVENTORY_STATUS.PICKED,
    updater: user
  })

  // Change inventory data to release locked qty
  inventory = await trxMgr.getRepository(Inventory).save({
    ...inventory,
    qty: inventory.qty - targetInventory.releaseQty,
    lockedQty: inventory.lockedQty - targetInventory.releaseQty,
    weight: inventory.weight - targetInventory.releaseWeight,
    lockedWeight: inventory.lockedWeight - targetInventory.releaseWeight,
    updater: user
  })

  await generateInventoryHistory(
    inventory,
    worksheetDetail.worksheet.releaseGood,
    INVENTORY_TRANSACTION_TYPE.PICKING,
    -targetInventory.releaseQty,
    -targetInventory.releaseWeight,
    user,
    trxMgr
  )

  // If toLocation is not same with fromLocation => Relocate inventory
  if (fromLocation.id !== toLocation.id) {
    const existingInvCnt: number = await trxMgr.getRepository(Inventory).count({
      status: INVENTORY_STATUS.STORED,
      location: toLocation
    })

    if (existingInvCnt) throw new Error(`There's items already.`)

    inventory = await trxMgr.getRepository(Inventory).save({
      ...inventory,
      location: toLocation,
      warehouse: toLocation.warehouse,
      zone: toLocation.zone,
      updater: user
    })

    await generateInventoryHistory(
      inventory,
      worksheetDetail.worksheet.releaseGood,
      INVENTORY_TRANSACTION_TYPE.RELOCATE,
      0,
      0,
      user,
      trxMgr
    )
  }

  // update status of worksheet details (EXECUTING = > DONE)
  await trxMgr.getRepository(WorksheetDetail).save({
    ...worksheetDetail,
    status: WORKSHEET_STATUS.DONE,
    updater: user
  })

  // No more item for the pallet => TERMINATE inventory
  if (leftQty === 0) {
    inventory = await trxMgr.getRepository(Inventory).save({
      ...inventory,
      status: INVENTORY_STATUS.TERMINATED,
      updater: user
    })

    await generateInventoryHistory(
      inventory,
      worksheetDetail.worksheet.releaseGood,
      INVENTORY_TRANSACTION_TYPE.TERMINATED,
      0,
      0,
      user,
      trxMgr
    )
  }

  // Check toLocation
  await switchLocationStatus(domain, toLocation, user, trxMgr)
  if (fromLocation.id !== toLocation.id) {
    // Check fromLocation cause pallet is relocated.
    await switchLocationStatus(domain, fromLocation, user, trxMgr)
  }
}
