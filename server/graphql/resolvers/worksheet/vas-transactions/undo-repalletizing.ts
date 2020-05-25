import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import { OrderVas } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { WORKSHEET_TYPE } from '../../../../constants'
import { Worksheet, WorksheetDetail } from '../../../../entities'
import { OperationGuideDataInterface, OperationGuideInterface, RepalletizedInvInfo } from './intefaces'

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
          'targetVas.vasOrder',
          'targetVas.vas'
        ]
      })

      const bizplace: Bizplace = wsd.bizplace
      const targetVas: OrderVas = wsd.targetVas

      if (!wsd) throw new Error(`Couldn't find worksheet detail with name: ${worksheetDetailName}`)
      if (!targetVas) throw new Error(`Couldn't find any related target vas, using current worksheet detail`)

      let operationGuide: OperationGuideInterface = JSON.parse(targetVas.operationGuide)
      let operationGuideData: OperationGuideDataInterface = operationGuide.data
      let repalletizedInvs: RepalletizedInvInfo[] = operationGuideData.repalletizedInvs

      const undoInventory: RepalletizedInvInfo = repalletizedInvs.find(
        (inv: RepalletizedInvInfo) => inv.palletId == palletId
      )
      if (!undoInventory) throw new Error(`Coundn't find pallet, ussing pallet id (${palletId})`)

      const requiredPalletQty: number =
        operationGuideData.requiredPalletQty + Math.floor(undoInventory.addedQty / operationGuideData.stdQty)

      repalletizedInvs = repalletizedInvs.filter((inv: RepalletizedInvInfo) => inv.palletId !== palletId)

      const targetWSD: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
        where: {
          domain,
          bizplace,
          targetVas,
          type: WORKSHEET_TYPE.VAS
        },
        relations: ['worksheet']
      })

      const worksheet: Worksheet = targetWSD.worksheet
      const relatedWSDs: WorksheetDetail[] = await trxMgr.getRepository(WorksheetDetail).find({
        where: {
          domain,
          bizplace,
          worksheet
        },
        relations: ['targetVas', 'targetVas.vas']
      })

      const relatedOrderVass: OrderVas[] = relatedWSDs
        .map((wsd: WorksheetDetail) => wsd.targetVas)
        .filter((ov: OrderVas) => ov.id !== targetVas.id && ov.set === targetVas.set && ov.vas.id === targetVas.vas.id)
        .map((ov: OrderVas) => {
          ov.operationGuide = JSON.parse(ov.operationGuide)
          const refOperationGuideData: OperationGuideDataInterface = {
            palletType: ov.operationGuide.data.palletType,
            stdQty: ov.operationGuide.data.stdQty,
            repalletizedInvs: ov.operationGuide.data.repalletizedInvs,
            requiredPalletQty
          }

          delete ov.operationGuide.data

          const refOperationGuide: OperationGuideInterface = {
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

      // Update related order vas
      await trxMgr.getRepository(OrderVas).save(relatedOrderVass)

      // Update current order vas
      const currentOperationGuideData: OperationGuideDataInterface = {
        palletType: operationGuide.data.palletType,
        stdQty: operationGuide.data.stdQty,
        repalletizedInvs,
        requiredPalletQty
      }
      delete operationGuide.data

      const currentOperationGuide: OperationGuideInterface = {
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
