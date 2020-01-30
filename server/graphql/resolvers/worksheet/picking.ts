import { OrderInventory, ORDER_INVENTORY_STATUS } from '@things-factory/sales-base'
import {
  Inventory,
  InventoryHistory,
  INVENTORY_STATUS,
  INVENTORY_TRANSACTION_TYPE,
  Location,
  LOCATION_STATUS
} from '@things-factory/warehouse-base'
import { getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { WorksheetDetail } from '../../../entities'
import { generateInventoryHistory } from '../../../utils/inventory-history-generator'

export const picking = {
  async picking(_: any, { worksheetDetailName, palletId, locationName, releaseQty }, context: any) {
    return await getManager().transaction(async trxMgr => {
      // get worksheet detail
      const worksheetDetail: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
        where: {
          domain: context.state.domain,
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
      const location: Location = await trxMgr.getRepository(Location).findOne({
        where: { domain: context.state.domain, name: locationName }
      })
      if (!location) throw new Error(`Location doesn't exists`)

      let targetInventory: OrderInventory = worksheetDetail.targetInventory
      let inventory: Inventory = targetInventory.inventory

      if (inventory.palletId !== palletId) throw new Error('Pallet ID is invalid')
      const leftQty: number = inventory.qty - releaseQty
      if (leftQty < 0) throw new Error(`Invalid qty, can't exceed limitation`)

      // Change status of order inventory
      await trxMgr.getRepository(OrderInventory).save({
        ...targetInventory,
        status: ORDER_INVENTORY_STATUS.PICKED,
        updater: context.state.user
      })

      // Change inventory data to release locked qty
      inventory = await trxMgr.getRepository(Inventory).save({
        ...inventory,
        qty: inventory.qty - targetInventory.releaseQty,
        lockedQty: inventory.lockedQty - targetInventory.releaseQty,
        weight: inventory.weight - targetInventory.releaseWeight,
        lockedWeight: inventory.lockedWeight - targetInventory.releaseWeight,
        updater: context.state.user
      })

      await generateInventoryHistory(
        inventory,
        worksheetDetail.worksheet.releaseGood,
        INVENTORY_TRANSACTION_TYPE.PICKING,
        -targetInventory.releaseQty,
        -targetInventory.releaseWeight,
        context.state.user,
        trxMgr
      )

      // If loation is not same with inventory.location => Relocate inventory
      if (location.id !== inventory.location.id) {
        const existingInvCnt: number = await trxMgr.getRepository(Inventory).count({
          status: INVENTORY_STATUS.STORED,
          location
        })

        if (existingInvCnt) throw new Error(`There's items already.`)

        inventory = await trxMgr.getRepository(Inventory).save({
          ...inventory,
          location,
          updater: context.state.user
        })

        await generateInventoryHistory(
          inventory,
          worksheetDetail.worksheet.releaseGood,
          INVENTORY_TRANSACTION_TYPE.RELOCATE,
          0,
          0,
          trxMgr
        )
      }

      // update status of worksheet details (EXECUTING = > DONE)
      await trxMgr.getRepository(WorksheetDetail).save({
        ...worksheetDetail,
        status: WORKSHEET_STATUS.DONE,
        updater: context.state.user
      })

      // No more item for the pallet => TERMINATE inventory
      if (leftQty === 0 && inventory.qty) {
        inventory = await trxMgr.getRepository(Inventory).save({
          ...inventory,
          status: INVENTORY_STATUS.TERMINATED,
          updater: context.state.user
        })

        const inventoryHistory: InventoryHistory = await generateInventoryHistory(
          inventory,
          worksheetDetail.worksheet.releaseGood,
          INVENTORY_TRANSACTION_TYPE.TERMINATED,
          0,
          0,
          context.state.user,
          trxMgr
        )

        const location: Location = await trxMgr.getRepository(Location).findOne(inventoryHistory.locationId)
        const allocatedItemsCnt: number = await trxMgr.getRepository(Inventory).count({
          domain: context.state.domain,
          status: INVENTORY_STATUS.STORED,
          location
        })

        if (!allocatedItemsCnt && location.status !== LOCATION_STATUS.OCCUPIED) {
          await trxMgr.getRepository(Location).save({
            ...location,
            status: LOCATION_STATUS.OCCUPIED,
            updater: context.state.user
          })
        }
      }
    })
  }
}
