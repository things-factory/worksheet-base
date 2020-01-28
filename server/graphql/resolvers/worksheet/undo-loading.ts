import { Bizplace } from '@things-factory/biz-base'
import { DeliveryOrder, OrderInventory, ORDER_INVENTORY_STATUS } from '@things-factory/sales-base'
import {
  Inventory,
  InventoryHistory,
  InventoryNoGenerator,
  INVENTORY_STATUS,
  INVENTORY_TRANSACTION_TYPE
} from '@things-factory/warehouse-base'
import { getManager } from 'typeorm'

export const undoLoading = {
  async undoLoading(_: any, { deliveryOrder, palletIds }, context: any) {
    return await getManager().transaction(async trxMgr => {
      if (!deliveryOrder?.id) throw new Error(`There's no delivery order id`)
      const foundDO: DeliveryOrder = await trxMgr.getRepository(DeliveryOrder).findOne({
        where: { id: deliveryOrder.id },
        relations: ['bizplace', 'releaseGood']
      })
      const customerBizplace: Bizplace = foundDO.bizplace

      // 1. Find target inventories based on delivery order and status
      let targetInventories: OrderInventory[] = await trxMgr.getRepository(OrderInventory).find({
        where: {
          domain: context.state.domain,
          bizplace: customerBizplace,
          deliveryOrder: foundDO,
          status: ORDER_INVENTORY_STATUS.LOADED
        },
        relations: ['inventory', 'releaseGood']
      })

      // 2. Filter out inventories which is included palletIds list.
      targetInventories = targetInventories
        .filter((targetInv: OrderInventory) => palletIds.includes(targetInv.inventory.palletId))
        .map((targetInv: OrderInventory) => {
          return {
            ...targetInv,
            deliveryOrder: null,
            status: ORDER_INVENTORY_STATUS.LOADING
          }
        })

      // 3. Remove relation with Delivery Order
      await trxMgr.getRepository(OrderInventory).save(targetInventories)

      // 4. Check whethere there's more order inventories which is related with foundDO
      // 4. 1) If there's no more order inventories which is related with foundDO
      //       Remove delivery order
      const remainTargetInv: number = await trxMgr.getRepository(OrderInventory).count({
        where: {
          deliveryOrder: foundDO
        }
      })

      if (!remainTargetInv) await trxMgr.getRepository(DeliveryOrder).delete(foundDO.id)

      // 5. If there was remained items => Merge into previous order inventories
      await Promise.all(
        targetInventories.map(async (targetInv: OrderInventory) => {
          const prevTargetInv: OrderInventory = await trxMgr.getRepository(OrderInventory).findOne({
            where: {
              releaseGood: targetInv.releaseGood,
              status: ORDER_INVENTORY_STATUS.LOADING,
              seq: targetInv.seq + 1
            }
          })

          if (prevTargetInv) {
            await trxMgr.getRepository(OrderInventory).save({
              ...prevTargetInv,
              releaseQty: targetInv.releaseQty + prevTargetInv.releaseQty,
              releaseWeight: targetInv.releaseWeight + prevTargetInv.releaseWeight,
              updater: context.state.user
            })
          }

          // 6. Update Inventory
          let inventory: Inventory = targetInv.inventory
          await trxMgr.getRepository(Inventory).save({
            ...inventory,
            qty: inventory.qty + targetInv.releaseQty,
            weight: inventory.weight + targetInv.releaseWeight,
            lastSeq: inventory.lastSeq + 1,
            updater: context.state.user
          })

          // 7. Create Inventory Hisotry
          inventory = await trxMgr.getRepository(Inventory).findOne({
            where: { id: inventory.id },
            relations: ['bizplace', 'product', 'warehouse', 'location']
          })

          const inventoryHistory: InventoryHistory = {
            ...inventory,
            qty: targetInv.releaseQty,
            weight: targetInv.releaseWeight,
            status: INVENTORY_STATUS.STORED,
            domain: context.state.domain,
            name: InventoryNoGenerator.inventoryHistoryName(),
            seq: inventory.lastSeq,
            transactionType: INVENTORY_TRANSACTION_TYPE.UNDO_LOADING,
            openingQty: inventory.qty - targetInv.releaseQty,
            openingWeight: inventory.weight - targetInv.releaseWeight,
            productId: inventory.product.id,
            warehouseId: inventory.warehouse.id,
            locationId: inventory.location.id,
            refOrderId: foundDO.releaseGood.id,
            orderRefNo: foundDO.releaseGood.refNo || null,
            orderNo: foundDO.releaseGood.name,
            creator: context.state.user,
            updater: context.state.user
          }
          delete inventoryHistory.id
          await trxMgr.getRepository(InventoryHistory).save(inventoryHistory)

          // 8. If targetInv is merged into previous target inventory
          if (prevTargetInv) await trxMgr.getRepository(OrderInventory).delete(targetInv.id)
        })
      )
    })
  }
}
