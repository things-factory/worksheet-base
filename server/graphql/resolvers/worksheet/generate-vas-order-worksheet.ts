import { OrderVas, ORDER_STATUS, ORDER_VAS_STATUS, VasOrder } from '@things-factory/sales-base'
import { getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { WorksheetNoGenerator } from '../../../utils/worksheet-no-generator'

export const generateVasOrderWorksheet = {
  async generateVasOrderWorksheet(_: any, { vasNo }, context: any) {
    return await getManager().transaction(async trxMgr => {
      /**
       * 1. Validation for vas order
       *    - data existing
       *    - status of vas order
       */
      const vasOrder: VasOrder = await trxMgr.getRepository(VasOrder).findOne({
        where: { domain: context.state.domain, name: vasNo },
        relations: ['bizplace', 'orderVass']
      })

      if (!vasOrder) throw new Error(`Vas order doesn't exists.`)
      if (vasOrder.status !== ORDER_STATUS.PENDING_RECEIVE) throw new Error('Status is not suitable for execution')

      /**
       * 2. Create worksheet detail for vass (if it exists)
       */
      const orderVass: [OrderVas] = vasOrder.orderVass
      let vasWorksheet: Worksheet = new Worksheet()
      if (orderVass && orderVass.length) {
        vasWorksheet = await trxMgr.getRepository(Worksheet).save({
          domain: context.state.domain,
          bizplace: vasOrder.bizplace,
          name: WorksheetNoGenerator.vas(),
          vasOrder: vasOrder,
          type: WORKSHEET_TYPE.VAS,
          status: WORKSHEET_STATUS.DEACTIVATED,
          creator: context.state.user,
          updater: context.state.user
        })

        await Promise.all(
          orderVass.map(async (orderVas: OrderVas) => {
            await trxMgr.getRepository(WorksheetDetail).save({
              domain: context.state.domain,
              bizplace: vasOrder.bizplace,
              worksheet: vasWorksheet,
              name: WorksheetNoGenerator.vasDetail(),
              targetVas: orderVas,
              type: WORKSHEET_TYPE.VAS,
              status: WORKSHEET_STATUS.DEACTIVATED,
              creator: context.state.user,
              updater: context.state.user
            })

            // 4. 2) Update status of order vass (ARRIVED => READY_TO_PROCESS)
            await trxMgr.getRepository(OrderVas).update(
              {
                domain: context.state.domain,
                name: orderVas.name,
                vasOrder: vasOrder
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
      await trxMgr.getRepository(VasOrder).save({
        ...vasOrder,
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
