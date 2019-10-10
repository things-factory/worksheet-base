import { OrderVas, ORDER_STATUS, ORDER_VAS_STATUS, VasOrder } from '@things-factory/sales-base'
import { Bizplace } from '@things-factory/biz-base'
import { getManager, getRepository, In } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { WorksheetNoGenerator } from '../../../utils/worksheet-no-generator'

export const generateVasOrderWorksheet = {
  async generateVasOrderWorksheet(_: any, { vasNo }, context: any) {
    return await getManager().transaction(async txMgr => {
      const foundVasOrder: VasOrder = await txMgr.getRepository(VasOrder).findOne({
        where: {
          domain: context.state.domain,
          name: vasNo,
          bizplace: In(context.state.bizplaces.map((bizplace: Bizplace) => bizplace.id)),
          status: ORDER_STATUS.PENDING_RECEIVE
        },
        relations: ['bizplace', 'orderVass']
      })

      if (!foundVasOrder) throw new Error(`Vas order doesn't exsits.`)
      const customerBizplace: Bizplace = foundVasOrder.bizplace
      let foundOVs: OrderVas[] = foundVasOrder.orderVass

      let vasWorksheet: Worksheet = new Worksheet()
      if (foundOVs && foundOVs.length) {
        // 3. 1) Create vas worksheet
        vasWorksheet = await txMgr.getRepository(Worksheet).save({
          domain: context.state.domain,
          bizplace: customerBizplace,
          name: WorksheetNoGenerator.vas(),
          vasOrder: foundVasOrder,
          type: WORKSHEET_TYPE.VAS,
          status: WORKSHEET_STATUS.DEACTIVATED,
          creator: context.state.user,
          updater: context.state.user
        })

        await Promise.all(
          foundOVs.map(async (orderVas: OrderVas) => {
            await txMgr.getRepository(WorksheetDetail).save({
              domain: context.state.domain,
              bizplace: foundVasOrder.bizplace,
              worksheet: vasWorksheet,
              name: WorksheetNoGenerator.vasDetail(),
              targetVas: orderVas,
              type: WORKSHEET_TYPE.VAS,
              status: WORKSHEET_STATUS.DEACTIVATED,
              creator: context.state.user,
              updater: context.state.user
            })

            // 4. 2) Update status of order vass (ARRIVED => READY_TO_PROCESS)
            await txMgr.getRepository(OrderVas).update(
              {
                domain: context.state.domain,
                name: orderVas.name,
                vasOrder: foundVasOrder
              },
              {
                ...orderVas,
                status: ORDER_VAS_STATUS.READY_TO_PROCESS,
                updater: context.state.user
              }
            )
          })
        )
      }

      /**
       * 5. Update status of vas order (PENDING_RECEIVE => READY_TO_EXECUTE)
       */
      await txMgr.getRepository(VasOrder).save({
        ...foundVasOrder,
        status: ORDER_STATUS.READY_TO_EXECUTE,
        updater: context.state.user
      })

      /**
       * 6. Returning worksheet as a result
       */
      return {
        vasWorksheet
      }
    })
  }
}
