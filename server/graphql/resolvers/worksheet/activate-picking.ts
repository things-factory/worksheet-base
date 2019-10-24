import { Bizplace } from '@things-factory/biz-base'
import { OrderInventory, ORDER_PRODUCT_STATUS, ORDER_STATUS, ReleaseGood } from '@things-factory/sales-base'
import { getManager } from 'typeorm'
import { WORKSHEET_STATUS } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const activatePicking = {
  async activatePicking(_: any, { worksheetNo, pickingWorksheetDetails }, context: any) {
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
          status: WORKSHEET_STATUS.DEACTIVATED
        },
        relations: ['bizplace', 'releaseGood', 'worksheetDetails', 'worksheetDetails.targetInventory']
      })

      if (!foundWorksheet) throw new Error(`Worksheet doesn't exists`)
      const customerBizplace: Bizplace = foundWorksheet.bizplace
      const foundWSDs: WorksheetDetail[] = foundWorksheet.worksheetDetails
      let targetInventories: OrderInventory[] = foundWSDs.map((foundWSD: WorksheetDetail) => foundWSD.targetInventory)

      /**
       * 2. Update description and status of picking worksheet details (status: DEACTIVATED => EXECUTING)
       */
      await Promise.all(
        pickingWorksheetDetails.map(async (pickingWorksheetDetail: WorksheetDetail) => {
          await trxMgr.getRepository(WorksheetDetail).update(
            {
              domain: context.state.domain,
              bizplace: customerBizplace,
              name: pickingWorksheetDetail.name,
              status: WORKSHEET_STATUS.DEACTIVATED
            },
            {
              description: pickingWorksheetDetail.description,
              status: WORKSHEET_STATUS.EXECUTING,
              updater: context.state.user
            }
          )
        })
      )

      /**
       * 3. Update target inventories (status: READY_TO_PICK => PICKING)
       */
      targetInventories = targetInventories.map((targetInventory: OrderInventory) => {
        return {
          ...targetInventory,
          status: ORDER_PRODUCT_STATUS.PICKING,
          updater: context.state.user
        }
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

      return worksheet
    })
  }
}
