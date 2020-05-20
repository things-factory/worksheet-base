import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import {
  ArrivalNotice,
  OrderInventory,
  OrderNoGenerator,
  OrderVas,
  ReleaseGood,
  ShippingOrder,
  VasOrder
} from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import {
  Inventory,
  InventoryNoGenerator,
  INVENTORY_STATUS,
  INVENTORY_TRANSACTION_TYPE,
  Location,
  Warehouse
} from '@things-factory/warehouse-base'
import { EntityManager, getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../../constants'
import { Worksheet, WorksheetDetail } from '../../../../entities'
import { generateInventoryHistory, WorksheetNoGenerator } from '../../../../utils'

interface OperationGuideDataInterface {
  palletType: string
  stdQty: number
  requiredPalletQty: number
  repalletizedInvIds: string[]
  completed: boolean
}

export declare type RefOrderType = ArrivalNotice | ReleaseGood | VasOrder | ShippingOrder

export const repalletizingResolver = {
  async repalletizing(_: any, { worksheetDetailName, palletId, locationName, packageQty }, context: any) {
    return await getManager().transaction(async (trxMgr: EntityManager) => {
      /**
       * Initialize required variables
       */
      const domain: Domain = context.state.domain
      const user: User = context.state.user

      // Find target worksheet detail & target order vas
      const wsd: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
        where: { domain, name: worksheetDetailName },
        relations: [
          'bizplace',
          'targetVas',
          'targetVas.inventory',
          'targetVas.inventory.product',
          'targetVas.vas',
          'targetVas.arrivalNotice',
          'targetVas.releaseGood',
          'targetVas.shippingOrder',
          'targetVas.vasOrder'
        ]
      })

      const bizplace: Bizplace = wsd.bizplace
      const targetVas: OrderVas = wsd.targetVas
      let originInv: Inventory = targetVas.inventory
      const location: Location = await trxMgr.getRepository(Location).findOne({
        where: { domain, name: locationName },
        relations: ['warehouse']
      })
      const warehouse: Warehouse = location.warehouse
      const operationGuideData: OperationGuideDataInterface = JSON.parse(targetVas.operationGuide)

      let refOrder: RefOrderType
      if (targetVas?.arrivalNotice?.id) {
        refOrder = targetVas.arrivalNotice
      } else if (targetVas?.releaseGood?.id) {
        refOrder = targetVas.releaseGood
      } else if (targetVas?.shippingOrder?.id) {
        refOrder = targetVas.shippingOrder
      } else if (targetVas?.vasOrder?.id) {
        refOrder = targetVas.vasOrder
      }

      // Validity checking
      if (!wsd) throw new Error(`Couldn't find target worksheet detail`)
      if (!targetVas) throw new Error(`Counldn't find target vas`)
      if (!originInv) throw new Error(`Inventory wasn't assigned to target vas`)
      if (originInv.qty < packageQty) throw new Error(`Inventory doesn't have enough packages`)
      if (!refOrder) throw new Error(`Couldn't find reference order with current order vas`)
      if (!location) throw new Error(`Counldn't find location by its name (${locationName})`)
      if (!warehouse) throw new Error(`Location (name: ${locationName}) doesn't have any relation with warehouse`)

      // Get release qty and release weight if refOrder is release good
      if (refOrder instanceof ReleaseGood) {
        const orderInv: OrderInventory = await trxMgr.getRepository(OrderInventory).findOne({
          where: { domain, bizplace, inventory: originInv, releaseGood: refOrder }
        })

        originInv.qty = orderInv.releaseQty
        originInv.weight = originInv.releaseWeight
      }

      // Create new inventory
      const unitWeight: number = originInv.weight / originInv.qty
      const copiedInv: Inventory = Object.assign({}, originInv)
      delete copiedInv.id

      const newInventory: Inventory = await trxMgr.getRepository(Inventory).save({
        ...copiedInv,
        domain,
        bizplace,
        palletId,
        name: InventoryNoGenerator.inventoryName(),
        warehouse,
        location,
        qty: packageQty,
        weight: packageQty * unitWeight,
        refOrderId: refOrder.id,
        refInventory: originInv,
        zone: location.zone,
        creator: User,
        updater: User
      })

      await generateInventoryHistory(
        newInventory,
        refOrder,
        INVENTORY_TRANSACTION_TYPE.REPALLETIZING,
        packageQty,
        packageQty * unitWeight,
        user,
        trxMgr
      )

      if (originInv.status !== INVENTORY_STATUS.TERMINATED) {
        const remainQty: number = originInv.qty - packageQty
        const remainWeight: number = originInv.weight - packageQty * unitWeight

        if (remainQty < 0 || remainWeight < 0)
          throw new Error(`Remain amount of product in inventory should't be negative value`)

        // Update original inventory
        originInv = await trxMgr.getRepository(Inventory).save({
          ...originInv,
          qty: remainQty,
          weight: remainWeight,
          updater: user
        })
      }

      await generateInventoryHistory(
        originInv,
        refOrder,
        INVENTORY_TRANSACTION_TYPE,
        -packageQty,
        -(packageQty * unitWeight),
        user,
        trxMgr
      )

      // Terminate if there's no more products on original inventory
      if (originInv.status !== INVENTORY_STATUS.TERMINATED && (originInv.qty == 0 || originInv.weight == 0)) {
        originInv = await trxMgr.getRepository(Inventory).save({
          ...originInv,
          status: INVENTORY_STATUS.TERMINATED,
          updater: user
        })

        await generateInventoryHistory(
          originInv,
          refOrder,
          INVENTORY_TRANSACTION_TYPE.REPALLETIZING,
          0,
          0,
          user,
          trxMgr
        )
      }

      if (refOrder instanceof ReleaseGood) {
        // If Reference Order is release good
        // Loading worksheet should be changed.

        const loadingOrderInv: OrderInventory = await trxMgr.getRepository(OrderInventory).findOne({
          where: { domain, bizplace, inventory: originInv, releaseGood: refOrder }
        })
        const loadingWSD: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
          where: { domain, bizplace, targetInventory: loadingOrderInv, type: WORKSHEET_TYPE.LOADING },
          relations: ['worksheet']
        })
        const loadingWS: Worksheet = loadingWSD.worksheet

        if (originInv.qty == 0 || originInv.weight == 0) {
          await trxMgr.getRepository(WorksheetDetail).delete(loadingWSD.id)
        } else {
          await trxMgr.getRepository(OrderInventory).save({
            ...loadingOrderInv,
            releaseQty: loadingOrderInv.releaseQty - packageQty,
            releaseWeight: loadingOrderInv.releaseWeight - unitWeight * packageQty,
            updater: user
          })
        }

        // Create new order inventory for loading
        delete loadingOrderInv.id
        const newOrdInv: OrderInventory = await trxMgr.getRepository(OrderInventory).save({
          ...loadingOrderInv,
          domain,
          bizplace,
          name: OrderNoGenerator.orderInventory(),
          inventory: originInv,
          releaseGood: refOrder,
          releaseQty: packageQty,
          releaseWeight: unitWeight * packageQty,
          creator: user,
          updater: user
        })

        // Create worksheet detail for loading
        delete loadingWSD.id
        await trxMgr.getRepository(WorksheetDetail).save({
          domain,
          bizplace,
          worksheet: loadingWS,
          name: WorksheetNoGenerator.loadingDetail(),
          targetInventory: newOrdInv,
          type: WORKSHEET_TYPE.LOADING,
          status: WORKSHEET_STATUS.DEACTIVATED,
          creator: user,
          updater: user
        })
      }

      const updatedOperationGuide: OperationGuideDataInterface = {
        palletType: operationGuideData.palletType,
        stdQty: operationGuideData.stdQty,
        requiredPalletQty: operationGuideData.requiredPalletQty - 1,
        repalletizedInvIds: [...operationGuideData.repalletizedInvIds, newInventory.id],
        completed: !Boolean(operationGuideData.requiredPalletQty - 1)
      }

      await trxMgr.getRepository(OrderVas).save({
        ...targetVas,
        operationGuide: JSON.stringify(updatedOperationGuide),
        updater: user
      })
    })
  }
}
