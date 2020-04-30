import { User } from '@things-factory/auth-base'
import { OrderInventory, ORDER_INVENTORY_STATUS } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory, Location } from '@things-factory/warehouse-base'
import { EntityManager, getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { WorksheetDetail } from '../../../entities'

export const inspecting = {
  async inspecting(
    _: any,
    { worksheetDetailName, palletId, locationName, inspectedQty, inspectedWeight },
    context: any
  ) {
    return await getManager().transaction(async trxMgr => {
      await executeInspection(
        worksheetDetailName,
        palletId,
        locationName,
        inspectedQty,
        inspectedWeight,
        context.state.domain,
        context.state.user,
        trxMgr
      )
    })
  }
}

export async function executeInspection(
  worksheetDetailName: string,
  palletId: string,
  locationName: string,
  inspectedQty: number,
  inspectedWeight: number,
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
      type: WORKSHEET_TYPE.CYCLE_COUNT
    },
    relations: [
      'worksheet',
      'worksheet.releaseGood',
      'targetInventory',
      'targetInventory.inventory',
      'targetInventory.inventory.product',
      'targetInventory.inventory.warehouse',
      'targetInventory.inventory.location'
    ]
  })
  if (!worksheetDetail) throw new Error(`Worksheet Details doesn't exists`)

  // get location by name
  const beforeLocation: Location = worksheetDetail.targetInventory.inventory.location
  const currentLocation: Location = await trxMgr.getRepository(Location).findOne({
    where: { domain, name: locationName },
    relations: ['warehouse']
  })
  if (!currentLocation) throw new Error(`Location doesn't exists`)

  let targetInventory: OrderInventory = worksheetDetail.targetInventory
  let inventory: Inventory = targetInventory.inventory

  if (inventory.palletId !== palletId) throw new Error('Pallet ID is invalid')

  if (
    beforeLocation.name !== currentLocation.name ||
    inspectedQty !== inventory.qty ||
    inspectedWeight !== inventory.weight
  ) {
    await trxMgr.getRepository(WorksheetDetail).save({
      ...worksheetDetail,
      status: WORKSHEET_STATUS.NOT_TALLY,
      updater: user
    })

    // Change status of order inventory
    await trxMgr.getRepository(OrderInventory).save({
      ...targetInventory,
      inspectedLocation: currentLocation.name,
      inspectedQty,
      inspectedWeight,
      status: ORDER_INVENTORY_STATUS.NOT_TALLY,
      updater: user
    })
  } else {
    await trxMgr.getRepository(WorksheetDetail).save({
      ...worksheetDetail,
      status: WORKSHEET_STATUS.DONE,
      updater: user
    })

    // Change status of order inventory
    await trxMgr.getRepository(OrderInventory).save({
      ...targetInventory,
      inspectedLocation: currentLocation.name,
      inspectedQty,
      inspectedWeight,
      status: ORDER_INVENTORY_STATUS.INSPECTED,
      updater: user
    })
  }
}
