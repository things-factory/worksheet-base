import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import { OrderInventory, OrderVas, ORDER_TYPES, ReleaseGood } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory, Location, Warehouse } from '@things-factory/warehouse-base'
import { EntityManager, getManager } from 'typeorm'
import { WorksheetDetail } from '../../../../entities'
import { OperationGuideDataInterface, OperationGuideInterface, RefOrderType, RepalletizedInvInfo } from './intefaces'

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
          'targetVas.vasOrder',
          'worksheet'
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
      // Update operation guide data for every related repalletizing vas
      const operationGuide: OperationGuideInterface = JSON.parse(targetVas.operationGuide)
      const operationGuideData: OperationGuideDataInterface = operationGuide.data

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
      if (!refOrder) throw new Error(`Couldn't find reference order with current order vas`)
      if (!location) throw new Error(`Counldn't find location by its name (${locationName})`)
      if (!warehouse) throw new Error(`Location (name: ${locationName}) doesn't have any relation with warehouse`)

      // Calculate remain qty and weight
      const { repalletizedQty, repalletizedWeight } = operationGuideData.repalletizedInvs.reduce(
        (
          repalletizedAmount: {
            repalletizedQty: number
            repalletizedWeight: number
          },
          repalletizedInv: RepalletizedInvInfo
        ) => {
          return {
            repalletizedQty: repalletizedAmount.repalletizedQty + repalletizedInv.addedQty,
            repalletizedWeight: repalletizedAmount.repalletizedWeight + repalletizedInv.addedWeight
          }
        },
        {
          repalletizedQty: 0,
          repalletizedWeight: 0
        }
      )

      // Validity check for amount of inventory
      let remainQty: number
      let remainWeight: number

      if (refOrder instanceof ReleaseGood) {
        const orderInv: OrderInventory = await trxMgr.getRepository(OrderInventory).findOne({
          where: { domain, bizplace, inventory: originInv, releaseGood: refOrder, type: ORDER_TYPES.RELEASE_OF_GOODS }
        })
        remainQty = orderInv.releaseQty - repalletizedQty
        remainWeight = orderInv.releaseWeight - repalletizedWeight
      } else {
        remainQty = originInv.qty - repalletizedQty
        remainWeight = originInv.weight - repalletizedWeight
      }

      if (!remainQty) throw new Error(`There's no more remain package of pallet (${originInv.palletId})`)
      if (remainQty < packageQty)
        throw new Error(`Pallet doesn't have enough number of packages (${originInv.palletId}`)

      const unitWeight: number = remainWeight / remainQty

      let repalletizedInvs: RepalletizedInvInfo[] = operationGuideData.repalletizedInvs
      let isCompleted: boolean // completed flag
      // Add more into prev repalletized pallet
      if (repalletizedInvs.find((inv: RepalletizedInvInfo) => inv.palletId === palletId)) {
        repalletizedInvs = repalletizedInvs.map((inv: RepalletizedInvInfo) => {
          if (inv.palletId === palletId) {
            isCompleted = inv.addedQty + packageQty === operationGuideData.stdQty

            return {
              ...inv,
              addedQty: inv.addedQty + packageQty,
              addedWeight: inv.addedWeight + unitWeight * packageQty,
              completed: isCompleted
            }
          } else {
            return inv
          }
        })
      } else {
        // Append new inventory information
        isCompleted = packageQty === operationGuideData.stdQty
        repalletizedInvs.push({
          palletId,
          locationName,
          addedQty: packageQty,
          addedWeight: unitWeight * packageQty,
          completed: isCompleted
        })
      }

      const updatedOperationGuideData: OperationGuideDataInterface = {
        ...operationGuideData,
        requiredPalletQty: isCompleted ? operationGuideData.requiredPalletQty - 1 : operationGuideData.requiredPalletQty
      }

      const relatedWSDs: WorksheetDetail[] = await trxMgr.getRepository(WorksheetDetail).find({
        where: {
          domain,
          bizplace,
          worksheet: targetVas.worksheet
        },
        relations: ['targetVas', 'targetVas.vas']
      })

      const relatedOrderVass: OrderVas[] = relatedWSDs
        .map((wsd: WorksheetDetail) => wsd.targetVas)
        .filter((ov: OrderVas) => ov.id !== targetVas.id && ov.vas.set === targetVas.vas.set)
        .map((ov: OrderVas) => {
          return {
            ...ov,
            operationGuide: {
              ...operationGuide,
              data: updatedOperationGuideData
            }
          }
        })

      // Update related order vas
      await trxMgr.getRepository(OrderVas).save(relatedOrderVass)

      // Update current order vas
      await trxMgr.getRepository(OrderVas).save({
        ...targetVas,
        operationGuide: {
          ...operationGuide,
          data: {
            ...updatedOperationGuideData,
            repalletizedInvs
          }
        }
      })
    })
  }
}
