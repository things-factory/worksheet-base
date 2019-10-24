import { OrderInventory, ORDER_PRODUCT_STATUS } from '@things-factory/sales-base'
import {
  Inventory,
  InventoryHistory,
  InventoryNoGenerator,
  INVENTORY_STATUS,
  INVENTORY_TRANSACTION_TYPE,
  Location,
  LOCATION_STATUS,
  LOCATION_TYPE
} from '@things-factory/warehouse-base'
import { getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const putaway = {
  async putaway(_: any, { worksheetDetailName, palletId, toLocation }, context: any) {
    return await getManager().transaction(async trxMgr => {
      // 1. get worksheet detail
      const worksheetDetail: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
        where: {
          domain: context.state.domain,
          name: worksheetDetailName,
          status: WORKSHEET_STATUS.EXECUTING,
          type: WORKSHEET_TYPE.PUTAWAY
        },
        relations: ['worksheet', 'targetInventory', 'targetInventory.inventory']
      })
      if (!worksheetDetail) throw new Error(`Worksheet Details doesn't exists`)
      let targetInventory: OrderInventory = worksheetDetail.targetInventory
      let inventory: Inventory = targetInventory.inventory
      if (inventory.palletId !== palletId) throw new Error('Pallet ID is invalid')

      const worksheet: Worksheet = worksheetDetail.worksheet
      if (!worksheet) throw new Error(`Worksheet doesn't exists`)

      // 3. get to location object
      const location: Location = await trxMgr.getRepository(Location).findOne({
        where: { domain: context.state.domain, name: toLocation, type: LOCATION_TYPE.SHELF },
        relations: ['warehouse']
      })
      if (!location) throw new Error(`Location doesn't exists`)

      // 4. update location of inventory (buffer location => toLocation)
      inventory = await trxMgr.getRepository(Inventory).save({
        ...inventory,
        location,
        status: INVENTORY_STATUS.STORED,
        lastSeq: inventory.lastSeq + 1,
        warehouse: location.warehouse,
        zone: location.warehouse.zone,
        updater: context.state.user
      })

      // 4. 1) Update status of location
      if (location.status === LOCATION_STATUS.EMPTY) {
        await trxMgr.getRepository(Location).save({
          ...location,
          status: LOCATION_STATUS.OCCUPIED,
          updater: context.state.user
        })
      }

      // 5. add inventory history
      inventory = await trxMgr.getRepository(Inventory).findOne({
        where: { id: inventory.id },
        relations: ['bizplace', 'product', 'warehouse', 'location']
      })
      let inventoryHistory: InventoryHistory = {
        ...inventory,
        domain: context.state.domain,
        name: InventoryNoGenerator.inventoryHistoryName(),
        seq: inventory.lastSeq,
        transactionType: INVENTORY_TRANSACTION_TYPE.PUTAWAY,
        productId: inventory.product.id,
        warehouseId: inventory.warehouse.id,
        locationId: inventory.location.id,
        creator: context.state.user,
        updater: context.state.user
      }
      delete inventoryHistory.id
      await trxMgr.getRepository(InventoryHistory).save(inventoryHistory)

      // 6. update status of order inventory
      await trxMgr.getRepository(OrderInventory).save({
        ...targetInventory,
        status: ORDER_PRODUCT_STATUS.STORED,
        updater: context.state.user
      })

      // 7. update status of worksheet details (EXECUTING => DONE)
      await trxMgr.getRepository(WorksheetDetail).save({
        ...worksheetDetail,
        status: WORKSHEET_STATUS.DONE,
        updater: context.state.user
      })
    })
  }
}
