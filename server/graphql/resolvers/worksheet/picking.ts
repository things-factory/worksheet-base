import {
  Inventory,
  InventoryHistory,
  InventoryNoGenerator,
  Location,
  LOCATION_STATUS
} from '@things-factory/warehouse-base'
import { getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { WorksheetDetail } from '../../../entities'

export const picking = {
  async picking(_: any, { palletId, releaseQty }, context: any) {
    return await getManager().transaction(async trxMgr => {
      // 1. get inventory
      let inventory: Inventory = await trxMgr.getRepository(Inventory).findOne({
        where: { domain: context.state.domain, palletId },
        relations: ['location']
      })
      if (!inventory) throw new Error(`Inventory doesn't exists`)

      // 2. get worksheet detail
      const worksheetDetail: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
        where: {
          domain: context.state.domain,
          targetInventory: inventory,
          status: WORKSHEET_STATUS.EXECUTING,
          type: WORKSHEET_TYPE.PICKING
        }
      })
      if (!worksheetDetail) throw new Error(`Worksheet Details doesn't exists`)

      // 2. update inventory quantity and seq
      await trxMgr.getRepository(Inventory).save({
        ...inventory,
        qty: inventory.qty - releaseQty,
        lastSeq: inventory.lastSeq + 1
      })

      // 3. add inventory history
      inventory = await trxMgr.getRepository(Inventory).findOne({
        where: { id: inventory.id },
        relations: ['bizplace', 'product', 'warehouse', 'location']
      })

      const inventoryHistory: InventoryHistory = {
        ...inventory,
        domain: context.state.domain,
        name: InventoryNoGenerator.inventoryHistoryName(),
        seq: inventory.lastSeq,
        productId: inventory.product.id,
        warehouseId: inventory.warehouse.id,
        locationId: inventory.location.id,
        creator: context.state.user,
        updater: context.state.user
      }
      delete inventoryHistory.id
      await trxMgr.getRepository(InventoryHistory).save(inventoryHistory)

      // 4. dispose inventory if quantity is zero
      if (inventory.qty <= 0) {
        await trxMgr.getRepository(Inventory).delete(inventory)

        // 4. 1) if inventory was disposed check whether location has other inventories
        const inventoryCounts: number = await trxMgr
          .getRepository(Inventory)
          .count({ where: { domain: context.state.domain, location: inventory.location } })
        if (inventoryCounts === 0) {
          // 4. 1) - 1 if location doesn't have other inventories => update status of location (status: OCCUPIED or FULL => EMPTY)
          await trxMgr.getRepository(Location).save({
            ...inventory.location,
            status: LOCATION_STATUS.EMPTY,
            updater: context.state.user
          })
        }

        // 4. 2) add inventory history
        const inventoryHistory: InventoryHistory = {
          ...inventory,
          domain: context.state.domain,
          name: InventoryNoGenerator.inventoryHistoryName(),
          seq: inventory.lastSeq + 1,
          description: 'DISPOSED',
          productId: inventory.product.id,
          warehouseId: inventory.warehouse.id,
          locationId: inventory.location.id,
          creator: context.state.user,
          updater: context.state.user
        }
        delete inventoryHistory.id
        await trxMgr.getRepository(InventoryHistory).save(inventoryHistory)
      }

      // 6. update status of worksheet details (EXECUTING = > DONE)
      await trxMgr.getRepository(WorksheetDetail).save({
        ...worksheetDetail,
        status: WORKSHEET_STATUS.DONE,
        updater: context.state.user
      })
    })
  }
}
