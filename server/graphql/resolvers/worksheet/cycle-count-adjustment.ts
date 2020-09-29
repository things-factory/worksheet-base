import { User } from '@things-factory/auth-base'
import { InventoryCheck, OrderInventory, ORDER_INVENTORY_STATUS, ORDER_STATUS } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import {
  Inventory,
  INVENTORY_STATUS,
  INVENTORY_TRANSACTION_TYPE,
  Location,
  Warehouse
} from '@things-factory/warehouse-base'
import { EntityManager, getManager, In } from 'typeorm'
import { WORKSHEET_STATUS } from '../../../constants'
import { WorksheetDetail } from '../../../entities'
import { generateInventoryHistory, switchLocationStatus } from '../../../utils'

export const cycleCountAdjustmentResolver = {
  async cycleCountAdjustment(_: any, { cycleCountNo, cycleCountWorksheetDetails }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await cycleCountAdjustment(trxMgr, domain, user, cycleCountNo, cycleCountWorksheetDetails)
    })
  }
}

export async function cycleCountAdjustment(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  cycleCountNo: string,
  cycleCountWorksheetDetails: Partial<WorksheetDetail>[]
): Promise<void> {
  // get cycle count no
  const cycleCount: InventoryCheck = await trxMgr.getRepository(InventoryCheck).findOne({
    where: {
      domain,
      name: cycleCountNo,
      status: ORDER_STATUS.PENDING_REVIEW
    }
  })

  // get cycle count wsd that is not tally
  const worksheetDetails: WorksheetDetail[] = await trxMgr.getRepository(WorksheetDetail).find({
    where: { domain, name: In(cycleCountWorksheetDetails.map(wsd => wsd.name)), status: WORKSHEET_STATUS.NOT_TALLY },
    relations: [
      'targetInventory',
      'targetInventory.inventory',
      'targetInventory.inventory.location',
      'targetInventory.inspectedLocation',
      'targetInventory.inspectedLocation.warehouse'
    ]
  })

  for (let worksheetDetail of worksheetDetails) {
    const targetInventory: OrderInventory = worksheetDetail.targetInventory

    let inventory: Inventory = targetInventory.inventory

    const transactQty: number = targetInventory.inspectedQty - inventory.qty
    const transactWeight: number = targetInventory.inspectedWeight - inventory.weight

    const foundInspectedLoc: Location = targetInventory.inspectedLocation
    const foundWarehouse: Warehouse = foundInspectedLoc.warehouse

    if (targetInventory.status === ORDER_INVENTORY_STATUS.MISSING) {
      inventory.status = INVENTORY_STATUS.TERMINATED
      inventory.qty = 0
      inventory.weight = 0
      inventory.lockedQty = 0
      inventory.lockedWeight = 0
      inventory.updater = user
      inventory = await trxMgr.getRepository(Inventory).save(inventory)

      await generateInventoryHistory(
        inventory,
        cycleCount,
        INVENTORY_TRANSACTION_TYPE.ADJUSTMENT,
        -inventory.qty,
        -inventory.weight,
        user,
        trxMgr
      )
    } else if (targetInventory.inspectedQty == 0) {
      // create inventory history
      await generateInventoryHistory(
        inventory,
        cycleCount,
        INVENTORY_TRANSACTION_TYPE.ADJUSTMENT,
        transactQty,
        transactWeight,
        user,
        trxMgr
      )

      // change inventory qty to 0 and terminate it
      inventory = await trxMgr.getRepository(Inventory).save({
        ...inventory,
        batchId: targetInventory.inspectedBatchId,
        qty: targetInventory.inspectedQty,
        lockedQty: 0,
        weight: targetInventory.inspectedWeight,
        lockedWeight: 0,
        location: foundInspectedLoc,
        status: INVENTORY_STATUS.TERMINATED,
        updater: user
      })

      // create inventory history
      await generateInventoryHistory(inventory, cycleCount, INVENTORY_TRANSACTION_TYPE.TERMINATED, 0, 0, user, trxMgr)
    } else {
      const prevLocationId: string = inventory.location.id

      inventory.batchId = targetInventory.inspectedBatchId
      inventory.qty = targetInventory.inspectedQty
      inventory.lockedQty = 0
      inventory.weight = targetInventory.inspectedWeight
      inventory.lockedWeight = 0
      inventory.location = foundInspectedLoc
      inventory.warehouse = foundWarehouse
      inventory.updater = user
      inventory = await trxMgr.getRepository(Inventory).save(inventory)

      if (prevLocationId !== foundInspectedLoc.id) {
        const prevLocation: Location = await trxMgr.getRepository(Location).findOne(prevLocationId)
        await switchLocationStatus(domain, prevLocation, user, trxMgr)
      }

      await generateInventoryHistory(
        inventory,
        cycleCount,
        INVENTORY_TRANSACTION_TYPE.ADJUSTMENT,
        transactQty,
        transactWeight,
        user,
        trxMgr
      )
    }

    targetInventory.status = ORDER_INVENTORY_STATUS.TERMINATED
    targetInventory.updater = user
    await trxMgr.getRepository(OrderInventory).save(targetInventory)

    worksheetDetail.status = WORKSHEET_STATUS.ADJUSTED
    worksheetDetail.updater = user
    await trxMgr.getRepository(WorksheetDetail).save(worksheetDetail)
  }

  // change cycle count status to DONE
  cycleCount.status = ORDER_STATUS.DONE
  cycleCount.updater = user
  await trxMgr.getRepository(InventoryCheck).save(cycleCount)
}
