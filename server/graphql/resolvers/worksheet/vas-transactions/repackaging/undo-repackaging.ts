import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import { OrderVas, VasOrder } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../../../entities'
import { dismissInventory, getWorksheetDetailByName, updateRelatedOrderVas } from '../common-utils'
import {
  OperationGuideInterface,
  PackingUnits,
  PalletChangesInterface,
  RefOrderType,
  RepackagingGuide,
  RepackedInvInfo
} from '../interfaces'

export const undoRepackagingResolver = {
  async undoRepackaging(_: any, { worksheetDetailName, fromPalletId, toPalletId }, context: any) {
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

      let operationGuide: OperationGuideInterface<RepackagingGuide> = JSON.parse(targetVas.operationGuide)
      let operationGuideData: RepackagingGuide = operationGuide.data
      let repackedInvs: RepackedInvInfo[] = operationGuideData.repackedInvs
      let undoInventory: RepackedInvInfo = repackedInvs.find((ri: RepackedInvInfo) => ri.palletId === toPalletId)
      if (!undoInventory) throw new Error(`Couldn't find pallet, using pallet id (${toPalletId})`)

      const packingUnit: string = operationGuideData.packingUnit
      const stdAmount: number = operationGuideData.stdAmount

      undoInventory.repackedFrom = undoInventory.repackedFrom.filter(
        (rf: PalletChangesInterface) => rf.fromPalletId !== fromPalletId
      )

      // 완전히 Repacked 상태인 pallet count
      const repackedPkgQty: number =
        undoInventory.repackedFrom.reduce((totalAmount: number, rf: PalletChangesInterface) => {
          const amount: number = packingUnit === PackingUnits.QTY ? rf.reducedQty : rf.reducedWeight
          totalAmount += amount
          return totalAmount
        }, 0) / stdAmount

      // Undo를 발생한 수량 차이를 계산
      undoInventory.repackedPkgQty = repackedPkgQty

      // Pallet 전체가 취소된 경우
      let updatedRepackedInvs: RepackedInvInfo[]
      if (!undoInventory.repackedFrom?.length) {
        updatedRepackedInvs = repackedInvs.filter((ri: RepackedInvInfo) => ri.palletId !== toPalletId)
      } else {
        updatedRepackedInvs = repackedInvs.map((ri: RepackedInvInfo) => {
          if (ri.palletId === toPalletId) ri = undoInventory
          return ri
        })
      }

      const requiredPackageQty: number = await getRequiredPackageQty(
        trxMgr,
        domain,
        bizplace,
        wsd.worksheet,
        targetVas,
        packingUnit,
        stdAmount
      )
      const repackedPackageQty: number = getRepackedPackageQty(updatedRepackedInvs)

      operationGuide.data.requiredPackageQty = requiredPackageQty - repackedPackageQty
      operationGuide.data.repackedInvs = updatedRepackedInvs

      if (!(refOrder instanceof VasOrder)) {
        const palletChanges: PalletChangesInterface[] = operationGuide.data.repackedInvs
          .map((ri: RepackedInvInfo) => ri.repackedFrom)
          .flat()
        await dismissInventory(trxMgr, wsd, targetVas, palletChanges, fromPalletId)
      }

      // Update every order vas to share same operation guide
      await updateRelatedOrderVas(trxMgr, domain, bizplace, wsd, targetVas, operationGuide, user)
    })
  }
}

function getRepackedPackageQty(repackedInvs: RepackedInvInfo[]): number {
  return repackedInvs.reduce((repackedPkgQty: number, ri: RepackedInvInfo) => (repackedPkgQty += ri.repackedPkgQty), 0)
}

/**
 * @description Get total required package qty to complete this Repackagine VAS Task.
 *
 * @param {EntityManager} trxMgr
 * @param {Domain} domain
 * @param {Bizplace} bizplace
 * @param {Worksheet} worksheet
 * @param {String} packingUnit
 * @param {Number} stdAmount
 */
async function getRequiredPackageQty(
  trxMgr: EntityManager,
  domain: Domain,
  bizplace: Bizplace,
  worksheet: Worksheet,
  currentOV: OrderVas,
  packingUnit: string,
  stdAmount: number
): Promise<number> {
  const relatedWSDs: WorksheetDetail[] = await trxMgr.getRepository(WorksheetDetail).find({
    where: { domain, bizplace, worksheet },
    relations: ['targetVas', 'targetVas.vas']
  })

  const orderVASs: OrderVas[] = relatedWSDs.map((wsd: WorksheetDetail) => wsd.targetVas)
  const { qty, weight } = orderVASs
    .filter((ov: OrderVas) => ov.set === currentOV.set && ov.vas.id === currentOV.vas.id)
    .reduce(
      (total: { qty: number; weight: number }, ov: OrderVas) => {
        total.qty += ov.qty
        total.weight += ov.weight

        return total
      },
      { qty: 0, weight: 0 }
    )

  if (packingUnit === PackingUnits.QTY) {
    return qty / stdAmount
  } else if (packingUnit === PackingUnits.WEIGHT) {
    return weight / stdAmount
  }
}
