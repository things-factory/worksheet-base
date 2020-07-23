import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import { OrderVas, VasOrder, ArrivalNotice, ReleaseGood } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { WorksheetDetail, Worksheet } from '../../../../../entities'
import { WORKSHEET_STATUS } from '../../../../../constants'
import { getWorksheetDetailByName, updateRelatedOrderVas, dismissInventory } from '../common-utils'
import { OperationGuideInterface, PalletChangesInterface, RelabelingGuide, RefOrderType } from '../interfaces'

export const undoRelabelingResolver = {
  async undoRelabeling(
    _: any,
    { worksheetDetailName, toPalletId }: { worksheetDetailName: string; fromPalletId: string; toPalletId: string },
    context: any
  ): Promise<void> {
    return await getManager().transaction(async (trxMgr: EntityManager) => {
      /** Initialize required variables */
      const { domain, user }: { domain: Domain; user: User } = context.state
      const wsd: WorksheetDetail = await getWorksheetDetailByName(trxMgr, domain, worksheetDetailName)
      const { bizplace, targetVas }: { bizplace: Bizplace; targetVas: OrderVas } = wsd

      if (!targetVas) throw new Error(`Couldn't find any related target vas, using current worksheet detail`)
      const { arrivalNotice, releaseGood, vasOrder } = targetVas
      const refOrder: RefOrderType = arrivalNotice || releaseGood || vasOrder

      let operationGuide: OperationGuideInterface<RelabelingGuide> = JSON.parse(targetVas.operationGuide)
      let operationGuideData: RelabelingGuide = operationGuide.data

      const fromPalletId: string = targetVas.inventory.palletId
      // Filter out pallets which has same id with undoPalletId
      operationGuide.data.relabeledFrom = operationGuideData.relabeledFrom.filter(
        (pc: PalletChangesInterface) =>
          pc.fromPalletId !== fromPalletId || (pc.fromPalletId === fromPalletId && pc.toPalletId !== toPalletId)
      )

      if (!(refOrder instanceof VasOrder)) {
        await dismissInventory(trxMgr, wsd, targetVas, operationGuide.data.relabeledFrom, fromPalletId)
      }

      // Update every related operation guide to share same data
      await updateRelatedOrderVas(trxMgr, domain, bizplace, wsd, targetVas, operationGuide, user)
    })
  }
}
