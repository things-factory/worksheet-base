import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import { OrderVas } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../../../entities'
import {
  OperationGuideInterface,
  PackingUnits,
  PalletChangesInterface,
  RepackagingGuide,
  RepackedInvInfo
} from '../intefaces'

export const undoRepackagingResolver = {
  async undoRepackaging(_: any, { worksheetDetailName, fromPalletId, toPalletId }, context: any) {
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
      let undoInventory: RepackedInvInfo = repackedInvs.find((ri: RepackedInvInfo) => ri.palletId === toPalletId)
      if (!undoInventory) throw new Error(`Couldn't find pallet, using pallet id (${toPalletId})`)
      // Filter out pallet which has same pallet ID with parameter

      const packingUnit: string = operationGuideData.packingUnit
      const stdAmount: number = operationGuideData.stdAmount

      undoInventory.repackedFrom = undoInventory.repackedFrom.filter(
        (rf: PalletChangesInterface) => rf.fromPalletId !== fromPalletId
      )

      // 완전히 Repacked 상태인 pallet count
      const repackedPkgQty: number = undoInventory.repackedFrom.filter((rf: PalletChangesInterface) => {
        const amount: number = packingUnit === PackingUnits.QTY ? rf.reducedQty : rf.reducedWeight
        return amount === stdAmount
      }).length

      // Undo를 발생한 수량 차이를 계산
      undoInventory.repackedPkgQty = repackedPkgQty

      // Pallet 전체가 취소된 경우
      let updatedRepackedInvs: RepackedInvInfo[]
      if (!undoInventory.repackedPkgQty) {
        updatedRepackedInvs = repackedInvs.filter((ri: RepackedInvInfo) => ri.palletId !== toPalletId)
      } else {
        updatedRepackedInvs = repackedInvs.map((ri: RepackedInvInfo) => {
          if (ri.palletId === toPalletId) {
            ri = undoInventory
          }
          return ri
        })
      }

      const requiredPackageQty: number = await getRequiredPackageQty(
        trxMgr,
        domain,
        bizplace,
        wsd.worksheet,
        packingUnit,
        stdAmount
      )
      const repackedPackageQty: number = getRepackedPackageQty(updatedRepackedInvs)

      operationGuide.data = {
        packingUnit: operationGuideData.packingUnit,
        toPackingType: operationGuideData.toPackingType,
        stdAmount: operationGuideData.stdAmount,
        requiredPackageQty: requiredPackageQty - repackedPackageQty,
        repackedInvs: updatedRepackedInvs
      }

      // Update every order vas to share same operation guide
      const worksheet: Worksheet = wsd.worksheet
      const relatedWSDs: WorksheetDetail[] = await trxMgr.getRepository(WorksheetDetail).find({
        where: { domain, bizplace, worksheet },
        relations: ['targetVas', 'targetVas.vas']
      })

      const relatedOVs: OrderVas[] = relatedWSDs
        .map((wsd: WorksheetDetail) => wsd.targetVas)
        .filter((ov: OrderVas) => ov.set === targetVas.set && ov.vas.id === targetVas.vas.id)
        .map((ov: OrderVas) => {
          return {
            ...ov,
            operationGuide: JSON.stringify(operationGuide),
            updater: user
          }
        })

      await trxMgr.getRepository(OrderVas).save(relatedOVs)
    })
  }
}

function getRepackedPackageQty(repackedInvs: RepackedInvInfo[]): number {
  return repackedInvs.reduce((repackedPkgQty: number, ri: RepackedInvInfo) => (repackedPkgQty += ri.repackedPkgQty), 0)
}

async function getRequiredPackageQty(
  trxMgr: EntityManager,
  domain: Domain,
  bizplace: Bizplace,
  worksheet: Worksheet,
  packingUnit: string,
  stdAmount: number
): Promise<number> {
  const relatedWSDs: WorksheetDetail[] = await trxMgr.getRepository(WorksheetDetail).find({
    where: { domain, bizplace, worksheet },
    relations: ['targetVas', 'targetVas.vas']
  })

  const orderVASs: OrderVas[] = relatedWSDs.map((wsd: WorksheetDetail) => wsd.targetVas)
  const { qty, weight } = orderVASs.reduce(
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
