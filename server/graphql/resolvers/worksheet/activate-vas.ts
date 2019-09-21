import { ArrivalNotice, OrderVas, ShippingOrder } from '@things-factory/sales-base'
import { getManager, getRepository } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { ORDER_STATUS, ORDER_VAS_STATUS, WORKSHEET_STATUS } from '../../../enum'

export const activateVas = {
  async activateVas(_: any, { name, vasWorksheetDetails }, context: any) {
    return await getManager().transaction(async () => {
      /**
       * 1. Validation for worksheet
       *    - data existing
       *    - status of worksheet
       */
      const foundWorksheet: Worksheet = await getRepository(Worksheet).findOne({
        where: {
          domain: context.state.domain,
          name
        },
        relations: ['arrivalNotice', 'shippingOrder', 'worksheetDetails', 'worksheetDetails.targetVas']
      })

      if (!foundWorksheet) throw new Error(`Worksheet doesn't exists`)
      if (foundWorksheet.status !== WORKSHEET_STATUS.DEACTIVATED)
        throw new Error('Status is not suitable for unloading')

      /**
       * 2. Update description of vas worksheet details
       */
      await Promise.all(
        vasWorksheetDetails.map(async (vasWorksheetDetail: WorksheetDetail) => {
          await getRepository(WorksheetDetail).update(
            {
              domain: context.state.domain,
              name: vasWorksheetDetail.name
            },
            {
              description: vasWorksheetDetail.description,
              updater: context.state.user
            }
          )
        })
      )

      /**
       * 3. Update order vas (status: READY_TO_PROCESS => PROCESSING)
       */
      const foundVasWorksheetDetails: WorksheetDetail[] = foundWorksheet.worksheetDetails.filter(
        (worksheetDetail: WorksheetDetail) => worksheetDetail.targetVas
      )
      await Promise.all(
        foundVasWorksheetDetails.map(async (vasWorksheetDetail: WorksheetDetail) => {
          await getRepository(OrderVas).update(
            {
              id: vasWorksheetDetail.targetVas.id,
              status: ORDER_VAS_STATUS.READY_TO_PROCESS
            },
            {
              status: ORDER_VAS_STATUS.PROCESSING,
              updater: context.state.user
            }
          )
        })
      )

      /**
       * 4. Update Parent Order (status: ??? => PROCESSING)
       */
      if (foundWorksheet.arrivalNotice && foundWorksheet.arrivalNotice.id) {
        const arrivalNotice: ArrivalNotice = foundWorksheet.arrivalNotice

        await getRepository(ArrivalNotice).save({
          ...arrivalNotice,
          status: ORDER_STATUS.PROCESSING,
          updater: context.state.user
        })
      } else if (foundWorksheet.shippingOrder && foundWorksheet.shippingOrder.id) {
        const shippingOrder: ShippingOrder = foundWorksheet.shippingOrder

        await getRepository(ShippingOrder).save({
          ...shippingOrder,
          status: ORDER_STATUS.PROCESSING,
          updater: context.state.user
        })
      }

      /**
       * 5. Update Worksheet (status: DEACTIVATED => EXECUTING)
       */
      return await getRepository(Worksheet).save({
        ...foundWorksheet,
        status: WORKSHEET_STATUS.EXECUTING,
        startedAt: Date.now(),
        updater: context.state.user
      })
    })
  }
}
