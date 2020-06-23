import { Bizplace } from '@things-factory/biz-base'
import { OrderInventory, ORDER_INVENTORY_STATUS, ORDER_STATUS, ReleaseGood } from '@things-factory/sales-base'
import { getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { activateVas } from './activate-vas'

export const activatePicking = {
  async activatePicking(_: any, { worksheetNo }, context: any) {
    return await getManager().transaction(async trxMgr => {
      /**
       * 1. Validation for worksheet
       *    - data existing
       *    - status of worksheet
       */
      const foundWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
        where: {
          domain: context.state.domain,
          name: worksheetNo,
          type: WORKSHEET_TYPE.PICKING,
          status: WORKSHEET_STATUS.DEACTIVATED
        },
        relations: ['bizplace', 'releaseGood', 'worksheetDetails', 'worksheetDetails.targetInventory']
      })

      if (!foundWorksheet) throw new Error(`Worksheet doesn't exists`)
      let foundWSDs: WorksheetDetail[] = foundWorksheet.worksheetDetails
      let targetInventories: OrderInventory[] = foundWSDs.map((foundWSD: WorksheetDetail) => foundWSD.targetInventory)

      /**
       * 2. Update status of picking worksheet details (status: DEACTIVATED => EXECUTING)
       */
      foundWSDs = foundWSDs.map((wsd: WorksheetDetail) => {
        return { ...wsd, status: WORKSHEET_STATUS.EXECUTING, updater: context.state.user }
      })
      await trxMgr.getRepository(WorksheetDetail).save(foundWSDs)

      /**
       * 3. Update target inventories (status: READY_TO_PICK => PICKING)
       */
      targetInventories = targetInventories.map((ordInv: OrderInventory) => {
        return { ...ordInv, status: ORDER_INVENTORY_STATUS.PICKING, updater: context.state.user }
      })
      await trxMgr.getRepository(OrderInventory).save(targetInventories)

      /**
       * 4. Update picking Worksheet (status: DEACTIVATED => EXECUTING)
       */
      const worksheet: Worksheet = await trxMgr.getRepository(Worksheet).save({
        ...foundWorksheet,
        status: WORKSHEET_STATUS.EXECUTING,
        startedAt: new Date(),
        updater: context.state.user
      })

      /**
       * 5. Update Release Good (status: READY_TO_PICK => PICKING)
       */
      const releaseGood: ReleaseGood = foundWorksheet.releaseGood
      await trxMgr.getRepository(ReleaseGood).save({
        ...releaseGood,
        status: ORDER_STATUS.PICKING,
        updater: context.state.user
      })

      let relatedVasWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
        where: { domain: context.state.domain, releaseGood, type: WORKSHEET_TYPE.VAS },
        relations: ['worksheetDetails']
      })

      /**
       * Activate VAS worksheet if it's exists
       * It means that there are VAS which is requested from customer side.
       *
       * VAS should be completed within picking step warehouse manager doesn't need to activate it manually.
       */
      if (relatedVasWorksheet) {
        await activateVas(
          trxMgr,
          context.state.domain,
          context.state.user,
          relatedVasWorksheet.name,
          relatedVasWorksheet.worksheetDetails
        )
      }

      /**
       * 6. Update PENDING_SPLIT order products (status: PENDING_SPLIT => TERMINATED)
       */
      const pendingSplitOrderInvs: OrderInventory[] = await trxMgr.getRepository(OrderInventory).find({
        where: { domain: context.state.domain, releaseGood, status: ORDER_INVENTORY_STATUS.PENDING_SPLIT }
      })
      if (pendingSplitOrderInvs?.length) {
        await trxMgr
          .getRepository(OrderInventory)
          .delete(pendingSplitOrderInvs.map((ordInv: OrderInventory) => ordInv.id))
      }

      return worksheet
    })
  }
}
