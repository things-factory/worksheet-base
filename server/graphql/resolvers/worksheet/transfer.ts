import { OrderInventory, ORDER_PRODUCT_STATUS } from '@things-factory/sales-base'
import {
  Inventory,
  InventoryHistory,
  InventoryNoGenerator,
  INVENTORY_STATUS,
  INVENTORY_TRANSACTION_TYPE
} from '@things-factory/warehouse-base'
import { getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const transfer = {
  async transfer(_: any, { palletId, toPalletId, qty }, context: any) {
    return await getManager().transaction(async trxMgr => {
      // 1. get to inventory
      let toInventory: Inventory = await trxMgr.getRepository(Inventory).findOne({
        where: { domain: context.state.domain, palletId: toPalletId },
        relations: ['bizplace', 'product', 'warehouse', 'location']
      })
      if (!toInventory) throw new Error(`to pallet doesn't exists`)

      // 2. get from inventory
      let fromInventory: Inventory = await trxMgr.getRepository(Inventory).findOne({
        where: { domain: context.state.domain, palletId },
        relations: ['bizplace', 'product', 'warehouse', 'location']
      })
      if (!fromInventory) throw new Error(`from pallet doesn't exists`)
      if (toInventory.batchId !== fromInventory.batchId) throw new Error(`Can't transfer to different batch`)

      // 3. get worksheet & worksheet detail
      const worksheetDetail: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
        where: {
          domain: context.state.domain,
          targetInventory: fromInventory,
          status: WORKSHEET_STATUS.EXECUTING,
          type: WORKSHEET_TYPE.PUTAWAY
        },
        relations: ['worksheet', 'targetInventory']
      })
      if (!worksheetDetail) throw new Error(`Worksheet Detail doesn't exists`)
      const worksheet: Worksheet = worksheetDetail.worksheet
      if (!worksheet) throw new Error(`Worksheet doesn't exists`)
      let targetInventory: OrderInventory = worksheetDetail.targetInventory

      // 4. transfer qty
      // 4. 1) if result < 0
      //    - throw error
      const leftQty = fromInventory.qty - qty
      if (leftQty < 0) throw new Error(`Invalid qty, can't exceed limitation`)

      // 4. 2) if result == 0
      if (leftQty == 0) {
        //    - plus qty to (toInventory)
        await trxMgr.getRepository(Inventory).save({
          ...toInventory,
          qty: toInventory.qty + qty,
          lastSeq: toInventory.lastSeq + 1,
          updater: context.state.user
        })
        //    - add inventory history
        delete toInventory.id
        await trxMgr.getRepository(InventoryHistory).save({
          ...toInventory,
          domain: context.state.domain,
          name: InventoryNoGenerator.inventoryHistoryName(),
          productId: toInventory.product.id,
          warehouseId: toInventory.warehouse.id,
          locationId: toInventory.location.id,
          seq: toInventory.lastSeq,
          transactionType: INVENTORY_TRANSACTION_TYPE.TRANSFERED_IN,
          creator: context.state.user,
          updater: context.state.user
        })
        //    - update (fromInventory)
        await trxMgr.getRepository(Inventory).save({
          ...fromInventory,
          qty: leftQty, // 0
          status: INVENTORY_STATUS.TERMINATED,
          lastSeq: fromInventory.lastSeq + 1,
          updater: context.state.user
        })

        await trxMgr.getRepository(OrderInventory).save({
          ...targetInventory,
          status: ORDER_PRODUCT_STATUS.TERMINATED
        })

        fromInventory = await trxMgr.getRepository(Inventory).findOne({
          where: { id: fromInventory.id },
          relations: ['bizplace', 'product', 'warehouse', 'location']
        })

        //    - add inventory history
        await trxMgr.getRepository(InventoryHistory).save({
          ...fromInventory,
          name: InventoryNoGenerator.inventoryHistoryName(),
          productId: fromInventory.product.id,
          warehouseId: fromInventory.warehouse.id,
          locationId: fromInventory.location.id,
          seq: fromInventory.lastSeq,
          transactionType: INVENTORY_TRANSACTION_TYPE.TRANSFERED_OUT,
          creator: context.state.user,
          updater: context.state.user
        })

        //    - update worksheetDetail (EXECUTING => DONE)
        await trxMgr.getRepository(WorksheetDetail).save({
          ...worksheetDetail,
          status: WORKSHEET_STATUS.DONE,
          updater: context.state.user
        })
      }
      // 4. 3) if result > 0
      else if (leftQty > 0) {
        await trxMgr.getRepository(Inventory).save({
          ...toInventory,
          qty: toInventory.qty + qty,
          lastSeq: toInventory.lastSeq + 1,
          updater: context.state.user
        })

        toInventory = await trxMgr.getRepository(Inventory).findOne({
          where: { id: toInventory.id },
          relations: ['bizplace', 'product', 'warehouse', 'location']
        })
        //    - add inventory history
        delete toInventory.id
        await trxMgr.getRepository(InventoryHistory).save({
          ...toInventory,
          domain: context.state.domain,
          name: InventoryNoGenerator.inventoryHistoryName(),
          productId: toInventory.product.id,
          warehouseId: toInventory.warehouse.id,
          locationId: toInventory.location.id,
          seq: toInventory.lastSeq,
          transactionType: INVENTORY_TRANSACTION_TYPE.TRANSFERED_IN,
          creator: context.state.user,
          updater: context.state.user
        })

        await trxMgr.getRepository(Inventory).save({
          ...fromInventory,
          qty: leftQty,
          lastSeq: fromInventory.lastSeq + 1,
          updater: context.state.user
        })

        fromInventory = await trxMgr.getRepository(Inventory).findOne({
          where: { id: fromInventory.id },
          relations: ['bizplace', 'product', 'warehouse', 'location']
        })

        //    - add inventory history
        await trxMgr.getRepository(InventoryHistory).save({
          ...fromInventory,
          name: InventoryNoGenerator.inventoryHistoryName(),
          productId: fromInventory.product.id,
          warehouseId: fromInventory.warehouse.id,
          locationId: fromInventory.location.id,
          seq: fromInventory.lastSeq,
          transactionType: INVENTORY_TRANSACTION_TYPE.TRANSFERED_OUT,
          creator: context.state.user,
          updater: context.state.user
        })
      }
    })
  }
}
