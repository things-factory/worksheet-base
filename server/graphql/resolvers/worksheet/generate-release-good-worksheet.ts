import { Bizplace, getPermittedBizplaceIds } from '@things-factory/biz-base'
import {
  OrderInventory,
  OrderVas,
  ORDER_INVENTORY_STATUS,
  ORDER_STATUS,
  ORDER_VAS_STATUS,
  ReleaseGood
} from '@things-factory/sales-base'
import { getManager, In } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { WorksheetNoGenerator } from '../../../utils'

export const generateReleaseGoodWorksheet = {
  async generateReleaseGoodWorksheet(_: any, { releaseGoodNo }, context: any) {
    return await getManager().transaction(async txMgr => {
      const foundReleaseGood: ReleaseGood = await txMgr.getRepository(ReleaseGood).findOne({
        where: {
          domain: context.state.domain,
          name: releaseGoodNo,
          bizplace: In(await getPermittedBizplaceIds(context.state.domain, context.state.user)),
          status: ORDER_STATUS.PENDING_RECEIVE
        },
        relations: ['bizplace', 'orderInventories', 'orderVass']
      })

      if (!foundReleaseGood) throw new Error(`Release good doesn't exsits.`)
      const customerBizplace: Bizplace = foundReleaseGood.bizplace
      let foundOIs: OrderInventory[] = foundReleaseGood.orderInventories
      let foundOVs: OrderVas[] = foundReleaseGood.orderVass

      /*
       * 2. Create worksheet and worksheet details for inventories
       */
      // 2. 1) Create picking worksheet
      const pickingWorksheet = await txMgr.getRepository(Worksheet).save({
        domain: context.state.domain,
        bizplace: customerBizplace,
        name: WorksheetNoGenerator.picking(),
        releaseGood: foundReleaseGood,
        type: WORKSHEET_TYPE.PICKING,
        status: WORKSHEET_STATUS.DEACTIVATED,
        creator: context.state.user,
        updater: context.state.user
      })

      // 2. 2) Create picking worksheet details
      const pickingWorksheetDetails = foundOIs.map((oi: OrderInventory) => {
        return {
          domain: context.state.domain,
          bizplace: customerBizplace,
          worksheet: pickingWorksheet,
          name: WorksheetNoGenerator.pickingDetail(),
          targetInventory: oi,
          type: WORKSHEET_TYPE.PICKING,
          status: WORKSHEET_STATUS.DEACTIVATED,
          creator: context.state.user,
          updater: context.state.user
        }
      })
      await txMgr.getRepository(WorksheetDetail).save(pickingWorksheetDetails)

      // 2. 4) Update status of order inventories (PENDING_RECEIVE => READY_TO_PICK)
      foundOIs = foundOIs.map((oi: OrderInventory) => {
        return {
          ...oi,
          status: ORDER_INVENTORY_STATUS.READY_TO_PICK,
          updater: context.state.user
        }
      })
      await txMgr.getRepository(OrderInventory).save(foundOIs)

      /**
       * 3. Create worksheet and worksheet details for vass (if it exists)
       */
      let vasWorksheet: Worksheet = new Worksheet()
      if (foundOVs && foundOVs.length) {
        // 3. 1) Create vas worksheet
        vasWorksheet = await txMgr.getRepository(Worksheet).save({
          domain: context.state.domain,
          bizplace: customerBizplace,
          name: WorksheetNoGenerator.vas(),
          releaseGood: foundReleaseGood,
          type: WORKSHEET_TYPE.VAS,
          status: WORKSHEET_STATUS.DEACTIVATED,
          creator: context.state.user,
          updater: context.state.user
        })

        // 3. 2) Create vas worksheet details
        const vasWorksheetDetails = foundOVs.map((ov: OrderVas) => {
          return {
            domain: context.state.domain,
            bizplace: customerBizplace,
            worksheet: vasWorksheet,
            name: WorksheetNoGenerator.vasDetail(),
            targetVas: ov,
            type: WORKSHEET_TYPE.VAS,
            status: WORKSHEET_STATUS.DEACTIVATED,
            creator: context.state.user,
            updater: context.state.user
          }
        })
        await txMgr.getRepository(WorksheetDetail).save(vasWorksheetDetails)

        // 3. 3) Update status of order vas (PENDING_RECEIVE => READY_TO_PROCESS)
        foundOVs = foundOVs.map((ov: OrderVas) => {
          return {
            ...ov,
            status: ORDER_VAS_STATUS.READY_TO_PROCESS,
            updater: context.state.user
          }
        })
        await txMgr.getRepository(OrderVas).save(foundOVs)
      }

      /**
       * 5. Update status of release good (PENDING_RECEIVE => READY_TO_PICK)
       */
      await txMgr.getRepository(ReleaseGood).save({
        ...foundReleaseGood,
        status: ORDER_STATUS.READY_TO_PICK,
        updater: context.state.user
      })

      /**
       * 6. Returning worksheet as a result
       */
      return {
        pickingWorksheet,
        vasWorksheet
      }
    })
  }
}
