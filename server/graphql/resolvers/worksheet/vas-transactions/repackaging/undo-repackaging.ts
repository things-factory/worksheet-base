import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import { OrderVas } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../../../entities'
import { OperationGuideInterface, RepackagingGuide, RepackedInvInfo } from '../intefaces'

export const undoRepackaging = {
  async undoRepackaging(_: any, { worksheetDetailName, palletId }, context: any) {
    return await getManager().transaction(async (trxMgr: EntityManager) => {
      /**
       * Initialize required variables
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

      let operationGuide: OperationGuideInterface<RepackagingGuide> = JSON.parse(targetVas.operationGuide)
      let operationGuideData: RepackagingGuide = operationGuide.data
      let repackedInvs: RepackedInvInfo[] = operationGuideData.repackedInvs
      const undoInventory: RepackedInvInfo = repackedInvs.find((inv: RepackedInvInfo) => inv.palletId === palletId)
      if (!undoInventory) throw new Error(`Couldn't find pallet, using pallet id (${palletId})`)
      // Filter out pallet which has same pallet ID with parameter
      repackedInvs = repackedInvs.filter((inv: RepackedInvInfo) => inv.palletId !== palletId)

      const worksheet: Worksheet = wsd.worksheet
      const relatedWSDs: WorksheetDetail[] = await trxMgr.getRepository(WorksheetDetail).find({
        where: { domain, bizplace, worksheet },
        relations: ['targetVas', 'targetVas.vas']
      })

      const requiredPackageQty: number = operationGuideData.requiredPackageQty + undoInventory.repackedPkgQty

      // Update related order vas
      const relatedOrderVass: OrderVas[] = relatedWSDs
        .map((wsd: WorksheetDetail) => wsd.targetVas)
        .filter((ov: OrderVas) => ov.id !== targetVas.id && ov.set === targetVas.set && ov.vas.id === targetVas.vas.id)
        .map((ov: OrderVas) => {
          ov.operationGuide = JSON.parse(ov.operationGuide)
          const refOperationGuideData: RepackagingGuide = {
            packingUnit: ov.operationGuide.data.packingUnit,
            toPackingType: ov.operationGuide.data.toPackingType,
            stdAmount: ov.operationGuide.data.stdAmount,
            repackedInvs: ov.operationGuide.data.repackedInvs,
            requiredPackageQty
          }

          delete ov.operationGuide.data

          const refOperationGuide: OperationGuideInterface<RepackagingGuide> = {
            ...ov.operationGuide,
            data: refOperationGuideData,
            completed: !Boolean(requiredPackageQty)
          }

          return {
            ...ov,
            operationGuide: JSON.stringify(refOperationGuide),
            updater: user
          }
        })

      await trxMgr.getRepository(OrderVas).save(relatedOrderVass)

      // Update current order vas
      const currentOperationGuideData: RepackagingGuide = {
        packingUnit: operationGuideData.packingUnit,
        toPackingType: operationGuideData.toPackingType,
        stdAmount: operationGuideData.stdAmount,
        requiredPackageQty,
        repackedInvs
      }
      delete operationGuide.data

      const currentOperationGuide: OperationGuideInterface<RepackagingGuide> = {
        ...operationGuide,
        data: currentOperationGuideData,
        completed: !Boolean(requiredPackageQty)
      }

      await trxMgr.getRepository(OrderVas).save({
        ...targetVas,
        operationGuide: JSON.stringify(currentOperationGuide),
        updater: user
      })
    })
  }
}
