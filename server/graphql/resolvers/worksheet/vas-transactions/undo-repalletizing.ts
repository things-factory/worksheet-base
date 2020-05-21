import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import { OrderVas } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory, INVENTORY_TRANSACTION_TYPE } from '@things-factory/warehouse-base'
import { EntityManager, getManager } from 'typeorm'
import { WorksheetDetail } from '../../../../entities'
import { generateInventoryHistory } from '../../../../utils'
import { OperationGuideDataInterface, OperationGuideInterface, RefOrderType, RepalletizedInvInfo } from './intefaces'
import { ReleaseGood } from '@things-factory/sales-base'

export const undoRepalletizingResolver = {
  async undoRepalletizing(_: any, { worksheetDetailName, palletId }, context: any) {
    return await getManager().transaction(async (trxMgr: EntityManager) => {
      /**
       * initialize required variables
       */
      const domain: Domain = context.state.domain
      const user: User = context.state.user

      const wsd: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
        where: { domain, name: worksheetDetailName },
        relations: [
          'bizplace',
          'targetVas',
          'targetVas.inventory',
          'targetVas.arrivalNotice',
          'targetVas.releaseGood',
          'targetVas.shippingOrder',
          'targetVas.vasOrder'
        ]
      })

      const bizplace: Bizplace = wsd.bizplace
      const targetVas: OrderVas = wsd.targetVas
      const originInv: Inventory = targetVas.inventory

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

      if (!wsd) throw new Error(`Couldn't find worksheet detail with name: ${worksheetDetailName}`)
      if (!targetVas) throw new Error(`Couldn't find any related target vas, using current worksheet detail`)

      let operationGuide: OperationGuideInterface = targetVas.operationGuide
      let operationGuideData: OperationGuideDataInterface = operationGuide.data
      let repalletizedInvs: RepalletizedInvInfo[] = operationGuideData.repalletizedInvs

      const undoInventory: RepalletizedInvInfo = repalletizedInvs.find(
        (inv: RepalletizedInvInfo) => inv.palletId == palletId
      )
      if (!undoInventory) throw new Error(`Coundn't find pallet, ussing pallet id (${palletId})`)

      const updatedOperationGuideData: OperationGuideDataInterface = {
        ...operationGuideData,
        requiredPalletQty: undoInventory.completed
          ? operationGuideData.requiredPalletQty + 1
          : operationGuideData.requiredPalletQty
      }

      repalletizedInvs = repalletizedInvs.filter((inv: RepalletizedInvInfo) => inv.palletId !== palletId)

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
