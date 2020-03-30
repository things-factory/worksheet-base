import {
  Inventory,
  Location,
  LOCATION_STATUS,
  INVENTORY_STATUS,
  InventoryHistory
} from '@things-factory/warehouse-base'
import { Bizplace } from '@things-factory/biz-base'
import { getManager, In } from 'typeorm'
import {
  ORDER_INVENTORY_STATUS,
  ORDER_STATUS,
  ORDER_VAS_STATUS,
  OrderInventory,
  OrderVas,
  ReleaseGood
} from '@things-factory/sales-base'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const confirmCancellationReleaseOrder = {
  async confirmCancellationReleaseOrder(_: any, { name }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const foundRO: ReleaseGood = await trxMgr.getRepository(ReleaseGood).findOne({
        where: { domain: context.state.domain, name, status: ORDER_STATUS.PENDING_CANCEL },
        relations: [
          'bizplace',
          'orderInventories',
          'orderInventories.inventory',
          'orderInventories.inventory.location',
          'orderVass'
        ]
      })

      if (!foundRO) throw new Error(`Release good order doesn't exists.`)
      let targetOIs: OrderInventory[] = foundRO.orderInventories
      let foundOVs: OrderVas[] = foundRO.orderVass
      let customerBizplace: Bizplace = foundRO.bizplace

      // 1. Check Order Inventory status
      // 1a. separate into two groups, group 1: pending cancel, group 2: picked
      const cancelOI: OrderInventory[] = targetOIs.filter(
        (oi: OrderInventory) => oi.status === ORDER_INVENTORY_STATUS.PENDING_CANCEL
      )
      const pickedOI: OrderInventory[] = targetOIs.filter(
        (oi: OrderInventory) => oi.status === ORDER_INVENTORY_STATUS.PICKED
      )

      if (pickedOI && pickedOI.length) {
        // revert the picked inventory qty, weight, status, seq that has execute half way or all
        const cancelledOI = pickedOI.map(async (oi: OrderInventory) => {
          let inventory: Inventory = oi.inventory
          let location: Location = inventory.location

          let foundInvHistory: InventoryHistory[] = await trxMgr.getRepository(InventoryHistory).find({
            where: {
              domain: context.state.domain,
              bizplace: customerBizplace,
              palletId: inventory.palletId,
              batchId: inventory.batchId
            }
          })

          // find seq at PICKING transaction type
          const pickingInvHis = foundInvHistory.filter(
            (invHistory: InventoryHistory) => invHistory.transactionType === ORDER_INVENTORY_STATUS.PICKING
          )
          const pickingSeq: any = pickingInvHis.map((invHistory: InventoryHistory) => invHistory.seq)

          inventory = await trxMgr.getRepository(Inventory).save({
            ...inventory,
            qty: inventory.qty + oi.releaseQty,
            weight: inventory.weight + oi.releaseWeight,
            seq: pickingSeq - 1,
            status: INVENTORY_STATUS.STORED,
            updater: context.state.user
          })

          // Update status of location
          if (location.status === LOCATION_STATUS.EMPTY) {
            await trxMgr.getRepository(Location).save({
              ...location,
              status: LOCATION_STATUS.OCCUPIED,
              updater: context.state.user
            })
          }

          return {
            ...oi,
            status: ORDER_INVENTORY_STATUS.CANCELLED,
            updater: context.state.user
          }
        })
        await trxMgr.getRepository(OrderInventory).save(cancelledOI)
      }

      // change status to cancelled for order inventory that has not executed yet
      const cancelledOI = cancelOI.map((oi: OrderInventory) => {
        return {
          ...oi,
          status: ORDER_INVENTORY_STATUS.CANCELLED,
          updater: context.state.user
        }
      })
      await trxMgr.getRepository(OrderInventory).save(cancelledOI)

      // remove history terminated and picking transaction type
      let invHistory: InventoryHistory[] = await trxMgr.getRepository(InventoryHistory).find({
        where: { domain: context.state.domain, refOrderId: foundRO.id }
      })
      if (invHistory && invHistory.length) {
        await trxMgr.getRepository(InventoryHistory).delete(invHistory)
      }

      // update status of order vass to CANCELLED
      if (foundOVs && foundOVs.length) {
        foundOVs = foundOVs.map((orderVas: OrderVas) => {
          return {
            ...orderVas,
            status: ORDER_VAS_STATUS.CANCELLED,
            updater: context.state.user
          }
        })
        await trxMgr.getRepository(OrderVas).save(foundOVs)
      }

      // find worksheet and update status to CANCELLED
      let foundWS: Worksheet[] = await trxMgr.getRepository(Worksheet).find({
        where: {
          domain: context.state.domain,
          releaseGood: foundRO
        }
      })

      foundWS = foundWS.map((ws: Worksheet) => {
        return {
          ...ws,
          status: ORDER_STATUS.CANCELLED,
          updater: context.state.user
        }
      })
      await trxMgr.getRepository(Worksheet).save(foundWS)

      // find worksheet detail and update status to PENDING_CANCEL
      let foundWSD: WorksheetDetail[] = await trxMgr.getRepository(WorksheetDetail).find({
        where: {
          domain: context.state.domain,
          targetInventory: In(targetOIs.map((oi: OrderInventory) => oi.id))
        }
      })

      foundWSD = foundWSD.map((wsd: WorksheetDetail) => {
        return {
          ...wsd,
          status: ORDER_STATUS.CANCELLED,
          updater: context.state.user
        }
      })
      await trxMgr.getRepository(WorksheetDetail).save(foundWSD)

      await trxMgr.getRepository(ReleaseGood).save({
        ...foundRO,
        status: ORDER_STATUS.CANCELLED,
        updater: context.state.user
      })

      return
    })
  }
}
