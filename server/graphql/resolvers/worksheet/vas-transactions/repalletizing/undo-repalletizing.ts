import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import { OrderVas } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../../../entities'
import { OperationGuideInterface, PalletChangesInterface, RepalletizedInvInfo, RepalletizingGuide } from '../intefaces'

export const undoRepalletizingResolver = {
  async undoRepalletizing(_: any, { worksheetDetailName, toPalletId }, context: any) {
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

      let operationGuide: OperationGuideInterface<RepalletizingGuide> = JSON.parse(targetVas.operationGuide)
      let operationGuideData: RepalletizingGuide = operationGuide.data
      let repackedInvs: RepalletizedInvInfo[] = operationGuideData.repalletizedInvs
      let undoInventory: RepalletizedInvInfo = repackedInvs.find(
        (ri: RepalletizedInvInfo) => ri.palletId === toPalletId
      )
      if (!undoInventory) throw new Error(`Couldn't find pallet, using pallet id (${toPalletId})`)

      const stdQty: number = operationGuideData.stdQty
      operationGuideData.repalletizedInvs = operationGuideData.repalletizedInvs.filter(
        (ri: RepalletizedInvInfo) => ri.palletId !== toPalletId
      )
      // 현재 취소하는 pallet이 완성되어 있는 상태였다면 필요 팔렛 수량을 하나 증가 시킴
      const totalQty: number = undoInventory.repalletizedFrom.reduce(
        (totalQty: number, rf: PalletChangesInterface) => (totalQty += rf.reducedQty),
        0
      )
      if (totalQty === stdQty) {
        operationGuideData.requiredPalletQty++
      }

      // Update every order vas to share same operation guide
      await updateRelatedOrderVas(trxMgr, domain, bizplace, wsd, targetVas, operationGuide, user)
    })
  }
}

/**
 * @description Update every related order vas to share same operationGuide data
 *
 * @param {EntityManager} trxMgr
 * @param {Domain} domain
 * @param {Bizplace} bizplace
 * @param {WorksheetDetail} wsd
 * @param {OrderVas} targetVas
 * @param {OperationGuideInterface<RepalletizingGuide>} operationGuide
 * @param {User} user
 */
async function updateRelatedOrderVas(
  trxMgr: EntityManager,
  domain: Domain,
  bizplace: Bizplace,
  wsd: WorksheetDetail,
  targetVas: OrderVas,
  operationGuide: OperationGuideInterface<RepalletizingGuide>,
  user: User
) {
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
}
