import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import { OrderVas } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory, INVENTORY_STATUS } from '@things-factory/warehouse-base'
import { EntityManager, Equal, getManager, Not } from 'typeorm'
import { WorksheetDetail } from '../../../../../entities'
import { executeVas } from '../../vas/execute-vas'
import {
  assignInventory,
  getRemainInventoryAmount,
  getWorksheetDetailByName,
  updateRelatedOrderVas
} from '../common-utils'
import { OperationGuideInterface, PalletChangesInterface, RefOrderType, RelabelingGuide } from '../interfaces'

export const relabelingResolver = {
  async relabeling(
    _: any,
    { worksheetDetailName, fromPalletId, toPalletId, locationName },
    context: any
  ): Promise<void> {
    return await getManager().transaction(async (trxMgr: EntityManager) => {
      const domain: Domain = context.state.domain
      const user: User = context.state.user

      // Find target worksheet detail & target order vas & bizplace
      const wsd: WorksheetDetail = await getWorksheetDetailByName(trxMgr, domain, worksheetDetailName)
      let { bizplace, targetVas }: { bizplace: Bizplace; targetVas: OrderVas } = wsd

      // Check whether to pallet id is duplicated or not.
      if (
        await trxMgr.getRepository(Inventory).count({
          where: { domain, bizplace, palletId: toPalletId, status: Not(Equal(INVENTORY_STATUS.TERMINATED)) }
        })
      ) {
        throw new Error(`Pallet (${toPalletId}) is already exists`)
      }

      // Init refOrder
      const { arrivalNotice, releaseGood, vasOrder }: { [key: string]: RefOrderType } = targetVas
      const refOrder: RefOrderType = arrivalNotice || releaseGood || vasOrder || null
      if (!refOrder) throw new Error(`Couldn't find reference order with current order vas`)

      // Assign inventory if specific inventory isn't assigned yet.
      // This case is occured when the VAS order comes with Arrival Notice or Release Good
      if (!targetVas.inventory) {
        targetVas = await assignInventory(trxMgr, domain, bizplace, user, wsd, refOrder, targetVas, fromPalletId)
      }

      let originInv: Inventory = targetVas.inventory
      let operationGuide: OperationGuideInterface<RelabelingGuide> = JSON.parse(targetVas.operationGuide)
      let operationGuideData: RelabelingGuide = operationGuide.data
      if (!operationGuideData.relabeledFrom) operationGuideData.relabeledFrom = []
      const palletChanges: PalletChangesInterface[] = operationGuideData.relabeledFrom
      const { remainQty, remainUomValue } = await getRemainInventoryAmount(
        trxMgr,
        refOrder,
        domain,
        bizplace,
        originInv,
        palletChanges,
        fromPalletId
      )

      const unitUomValue: number = remainUomValue / remainQty
      let newPalletChange: PalletChangesInterface = {
        fromPalletId,
        toPalletId,
        reducedQty: 0,
        reducedUomValue: 0
      }
      if (locationName) {
        newPalletChange.locationName = locationName
      } else {
        originInv = await trxMgr.getRepository(Inventory).findOne(originInv.id, { relations: ['location'] })
        newPalletChange.locationName = originInv.location.name
      }

      if (remainQty < targetVas.qty) {
        // 남은 수량으로 전체 작업을 처리할 수 없는 경우
        newPalletChange.reducedQty = remainQty
        newPalletChange.reducedUomValue = remainQty * unitUomValue
      } else {
        // 남은 수량으로 전체 작업을 처리할 수 있는 경우
        newPalletChange.reducedQty = targetVas.qty
        newPalletChange.reducedUomValue = targetVas.uomValue
      }

      palletChanges.push(newPalletChange)
      operationGuide.data.relabeledFrom = palletChanges

      // Update every order vas to share same operation guide
      await updateRelatedOrderVas<RelabelingGuide>(trxMgr, domain, bizplace, wsd, targetVas, operationGuide, user)
      await executeVas(trxMgr, domain, user, wsd)
    })
  }
}
