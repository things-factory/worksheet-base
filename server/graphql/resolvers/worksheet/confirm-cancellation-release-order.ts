import {
  Inventory,
  Location,
  LOCATION_STATUS,
  INVENTORY_STATUS,
  InventoryHistory,
} from '@things-factory/warehouse-base'
import { Bizplace } from '@things-factory/biz-base'
import { getManager, In } from 'typeorm'
import {
  ORDER_INVENTORY_STATUS,
  ORDER_STATUS,
  ORDER_VAS_STATUS,
  OrderInventory,
  DeliveryOrder,
  OrderVas,
  ReleaseGood,
} from '@things-factory/sales-base'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const confirmCancellationReleaseOrder = {
  async confirmCancellationReleaseOrder(_: any, { name }, context: any) {
    return await getManager().transaction(async (trxMgr) => {
      let foundRO: ReleaseGood = await trxMgr.getRepository(ReleaseGood).findOne({
        where: { domain: context.state.domain, name, status: ORDER_STATUS.PENDING_CANCEL },
        relations: [
          'bizplace',
          'orderInventories',
          'orderInventories.inventory',
          'orderInventories.inventory.location',
          'orderVass',
        ],
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
      let pickedOI: OrderInventory[] = targetOIs.filter(
        (oi: OrderInventory) => oi.status === ORDER_INVENTORY_STATUS.PENDING_REVERSE
      )

      if (pickedOI && pickedOI.length) {
        await trxMgr.getRepository(OrderInventory).save(
          await Promise.all(
            pickedOI.map(async (oi: OrderInventory) => {
              let foundInv: Inventory = oi.inventory
              let foundLoc: Location = foundInv.location

              const foundInvHistory: InventoryHistory[] = await trxMgr.getRepository(InventoryHistory).find({
                where: {
                  domain: context.state.domain,
                  bizplace: customerBizplace,
                  palletId: foundInv.palletId,
                  batchId: foundInv.batchId,
                  refOrderId: foundRO.id,
                },
              })

              // find seq at PICKING transaction type
              let pickingSeq: any = foundInvHistory
                .filter((invHistory: InventoryHistory) => invHistory.transactionType === ORDER_INVENTORY_STATUS.PICKING)
                .map((invHistory: InventoryHistory) => invHistory.seq)

              let newOrderInv: OrderInventory = {
                ...oi,
                status: ORDER_INVENTORY_STATUS.CANCELLED,
                updater: context.state.user,
              }

              if (oi?.inventory?.id) {
                let inv: Inventory = await trxMgr.getRepository(Inventory).findOne(oi.inventory.id)
                inv = {
                  ...inv,
                  qty: foundInv.qty + oi.releaseQty,
                  weight: foundInv.weight + oi.releaseWeight,
                  lastSeq: pickingSeq[0] - 1,
                  status: INVENTORY_STATUS.STORED,
                  updater: context.state.user,
                }
                await trxMgr.getRepository(Inventory).save(inv)
              }

              // Update status of location
              if (foundLoc.status === LOCATION_STATUS.EMPTY) {
                await trxMgr.getRepository(Location).save({
                  ...foundLoc,
                  status: LOCATION_STATUS.OCCUPIED,
                  updater: context.state.user,
                })
              }

              return newOrderInv
            })
          )
        )
      }

      // change status to cancelled for order inventory that has not executed yet
      if (cancelOI && cancelOI.length) {
        const cancelledOI = cancelOI.map((oi: OrderInventory) => {
          return {
            ...oi,
            status: ORDER_INVENTORY_STATUS.CANCELLED,
            updater: context.state.user,
          }
        })
        await trxMgr.getRepository(OrderInventory).save(cancelledOI)
      }

      // remove history terminated and picking transaction type
      let invHistory: InventoryHistory[] = await trxMgr.getRepository(InventoryHistory).find({
        where: { domain: context.state.domain, refOrderId: foundRO.id },
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
            updater: context.state.user,
          }
        })
        await trxMgr.getRepository(OrderVas).save(foundOVs)
      }

      // find worksheet and update status to CANCELLED
      let foundWS: Worksheet[] = await trxMgr.getRepository(Worksheet).find({
        where: {
          domain: context.state.domain,
          releaseGood: foundRO,
        },
      })

      foundWS = foundWS.map((ws: Worksheet) => {
        return {
          ...ws,
          status: ORDER_STATUS.CANCELLED,
          updater: context.state.user,
        }
      })
      await trxMgr.getRepository(Worksheet).save(foundWS)

      // find worksheet detail and update status to PENDING_CANCEL
      let foundWSD: WorksheetDetail[] = await trxMgr.getRepository(WorksheetDetail).find({
        where: {
          domain: context.state.domain,
          targetInventory: In(targetOIs.map((oi: OrderInventory) => oi.id)),
        },
      })

      if (foundWSD && foundWSD.length) {
        foundWSD = foundWSD.map((wsd: WorksheetDetail) => {
          return {
            ...wsd,
            status: ORDER_STATUS.CANCELLED,
            updater: context.state.user,
          }
        })
        await trxMgr.getRepository(WorksheetDetail).save(foundWSD)
      }

      // find DO and change status to pending cancel
      let foundDO: DeliveryOrder[] = await trxMgr.getRepository(DeliveryOrder).find({
        where: { domain: context.state.domain, releaseGood: foundRO, status: ORDER_STATUS.PENDING_CANCEL },
        relations: ['transportVehicle'],
      })

      if (foundDO && foundDO.length) {
        foundDO = foundDO.map((deliveryOrder: DeliveryOrder) => {
          return {
            ...deliveryOrder,
            status: ORDER_STATUS.CANCELLED,
            updater: context.state.user,
          }
        })
        await trxMgr.getRepository(DeliveryOrder).save(foundDO)
      }

      await trxMgr.getRepository(ReleaseGood).save({
        ...foundRO,
        status: ORDER_STATUS.CANCELLED,
        updater: context.state.user,
      })

      return
    })
  },
}
