import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import { OrderVas } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { WORKSHEET_TYPE } from '../../../../../constants'
import { Worksheet, WorksheetDetail } from '../../../../../entities'
import { OperationGuideInterface, RepalletizedInvInfo, RepalletizingGuide } from '../intefaces'

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
          'worksheet',
          'targetVas',
          'targetVas.inventory',
          'targetVas.arrivalNotice',
          'targetVas.releaseGood',
          'targetVas.shippingOrder',
          'targetVas.vasOrder',
          'targetVas.vas'
        ]
      })

      const bizplace: Bizplace = wsd.bizplace
      const targetVas: OrderVas = wsd.targetVas

      if (!wsd) throw new Error(`Couldn't find worksheet detail with name: ${worksheetDetailName}`)
      if (!targetVas) throw new Error(`Couldn't find any related target vas, using current worksheet detail`)

      let operationGuide: OperationGuideInterface<RepalletizingGuide> = JSON.parse(targetVas.operationGuide)
      let operationGuideData: RepalletizingGuide = operationGuide.data
      let repalletizedInvs: RepalletizedInvInfo[] = operationGuideData.repalletizedInvs

      const undoInventory: RepalletizedInvInfo = repalletizedInvs.find(
        (inv: RepalletizedInvInfo) => inv.palletId == palletId
      )
      if (!undoInventory) throw new Error(`Couldn't find pallet, using pallet id (${palletId})`)
      // Filter out pallet which is matched with current pallet id
      repalletizedInvs = repalletizedInvs.filter((inv: RepalletizedInvInfo) => inv.palletId !== palletId)

      const worksheet: Worksheet = wsd.worksheet
      const relatedWSDs: WorksheetDetail[] = await trxMgr.getRepository(WorksheetDetail).find({
        where: { domain, bizplace, worksheet },
        relations: ['targetVas', 'targetVas.vas']
      })

      const requiredPalletQty: number =
        operationGuideData.requiredPalletQty + Math.floor(undoInventory.addedQty / operationGuideData.stdQty)

      // Update related order vas
      const relatedOrderVass: OrderVas[] = relatedWSDs
        .map((wsd: WorksheetDetail) => wsd.targetVas)
        .filter((ov: OrderVas) => ov.id !== targetVas.id && ov.set === targetVas.set && ov.vas.id === targetVas.vas.id)
        .map((ov: OrderVas) => {
          ov.operationGuide = JSON.parse(ov.operationGuide)
          const refOperationGuideData: RepalletizingGuide = {
            palletType: ov.operationGuide.data.palletType,
            stdQty: ov.operationGuide.data.stdQty,
            repalletizedInvs: ov.operationGuide.data.repalletizedInvs,
            requiredPalletQty
          }

          delete ov.operationGuide.data

          const refOperationGuide: OperationGuideInterface<RepalletizingGuide> = {
            ...ov.operationGuide,
            data: refOperationGuideData,
            completed: !Boolean(requiredPalletQty)
          }

          return {
            ...ov,
            operationGuide: JSON.stringify(refOperationGuide),
            updater: user
          }
        })

      await trxMgr.getRepository(OrderVas).save(relatedOrderVass)

      // Update current order vas
      const currentOperationGuideData: RepalletizingGuide = {
        palletType: operationGuide.data.palletType,
        stdQty: operationGuide.data.stdQty,
        repalletizedInvs,
        requiredPalletQty
      }
      delete operationGuide.data

      const currentOperationGuide: OperationGuideInterface<RepalletizingGuide> = {
        ...operationGuide,
        data: currentOperationGuideData,
        completed: !Boolean(requiredPalletQty)
      }

      await trxMgr.getRepository(OrderVas).save({
        ...targetVas,
        operationGuide: JSON.stringify(currentOperationGuide),
        updater: user
      })
    })
  }
}
