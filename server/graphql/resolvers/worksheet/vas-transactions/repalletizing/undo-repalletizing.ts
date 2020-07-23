import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import { OrderVas, VasOrder } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { WorksheetDetail } from '../../../../../entities'
import { dismissInventory, getWorksheetDetailByName, updateRelatedOrderVas } from '../common-utils'
import {
  OperationGuideInterface,
  PalletChangesInterface,
  RefOrderType,
  RepalletizedInvInfo,
  RepalletizingGuide
} from '../interfaces'

export const undoRepalletizingResolver = {
  async undoRepalletizing(_: any, { worksheetDetailName, fromPalletId, toPalletId }, context: any) {
    return await getManager().transaction(async (trxMgr: EntityManager) => {
      /**
       * Initialize required variables
       */
      const domain: Domain = context.state.domain
      const user: User = context.state.user
      const wsd: WorksheetDetail = await getWorksheetDetailByName(trxMgr, domain, worksheetDetailName)
      const bizplace: Bizplace = wsd.bizplace
      const targetVas: OrderVas = wsd.targetVas
      const { arrivalNotice, releaseGood, vasOrder } = targetVas
      const refOrder: RefOrderType = arrivalNotice || releaseGood || vasOrder

      let operationGuide: OperationGuideInterface<RepalletizingGuide> = JSON.parse(targetVas.operationGuide)
      let operationGuideData: RepalletizingGuide = operationGuide.data
      let repalletizedInvs: RepalletizedInvInfo[] = operationGuideData.repalletizedInvs
      let undoInventory: RepalletizedInvInfo = repalletizedInvs.find(
        (ri: RepalletizedInvInfo) => ri.palletId === toPalletId
      )
      if (!undoInventory) throw new Error(`Couldn't find pallet, using pallet id (${toPalletId})`)

      const stdQty: number = operationGuideData.stdQty

      // If current undo pallet is completed pallet, plus 1 required pallet qty
      const totalQty: number = undoInventory.repalletizedFrom.reduce(
        (totalQty: number, rf: PalletChangesInterface) => (totalQty += rf.reducedQty),
        0
      )

      if (totalQty === stdQty) {
        operationGuideData.requiredPalletQty++
      }

      undoInventory.repalletizedFrom = undoInventory.repalletizedFrom.filter(
        (rf: PalletChangesInterface) => rf.fromPalletId !== fromPalletId
      )

      let updatedRepalletizedInvs: RepalletizedInvInfo[]
      if (!undoInventory.repalletizedFrom?.length) {
        updatedRepalletizedInvs = repalletizedInvs.filter((ri: RepalletizedInvInfo) => ri.palletId !== toPalletId)
      } else {
        updatedRepalletizedInvs = repalletizedInvs.map((ri: RepalletizedInvInfo) => {
          if (ri.palletId === toPalletId) {
            ri = undoInventory
          }
          return ri
        })
      }
      operationGuide.data.repalletizedInvs = updatedRepalletizedInvs

      if (!(refOrder instanceof VasOrder)) {
        const palletChanges: PalletChangesInterface[] = operationGuide.data.repalletizedInvs
          .map((ri: RepalletizedInvInfo) => ri.repalletizedFrom)
          .flat()
        await dismissInventory(trxMgr, wsd, targetVas, palletChanges, toPalletId)
      }

      // Update every order vas to share same operation guide
      await updateRelatedOrderVas<RepalletizingGuide>(trxMgr, domain, bizplace, wsd, targetVas, operationGuide, user)
    })
  }
}
