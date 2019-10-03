import { OrderVas, ORDER_STATUS, ORDER_VAS_STATUS, VasOrder } from '@things-factory/sales-base'
import { getManager, getRepository } from 'typeorm'
import { WORKSHEET_STATUS } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const activateVas = {
  async activateVas(_: any, { worksheetNo, vasWorksheetDetails }, context: any) {
    return await getManager().transaction(async () => {
      /**
       * 1. Validation for worksheet
       *    - data existing
       *    - status of worksheet
       */
      const foundWorksheet: Worksheet = await getRepository(Worksheet).findOne({
        where: {
          domain: context.state.domain,
          name: worksheetNo,
          status: WORKSHEET_STATUS.DEACTIVATED
        },
        relations: ['vasOrder', 'worksheetDetails', 'worksheetDetails.targetVas']
      })

      if (!foundWorksheet) throw new Error(`Worksheet doesn't exists`)
      const foundWSDs: WorksheetDetail[] = foundWorksheet.worksheetDetails
      const foundVasOrder: VasOrder = foundWorksheet.vasOrder
      let targetVASs: OrderVas[] = foundWSDs.map((foundWSD: WorksheetDetail) => foundWSD.targetVas)

      /**
       * 2. Update description of vas worksheet details
       */
      await Promise.all(
        vasWorksheetDetails.map(async (vasWorksheetDetail: WorksheetDetail) => {
          await getRepository(WorksheetDetail).update(
            {
              domain: context.state.domain,
              name: vasWorksheetDetail.name,
              status: WORKSHEET_STATUS.DEACTIVATED
            },
            {
              description: vasWorksheetDetail.description,
              status: WORKSHEET_STATUS.EXECUTING,
              updater: context.state.user
            }
          )
        })
      )

      /**
       * 3. Update target vass (status: READY_TO_PROCESS => PROCESSING)
       */
      targetVASs = targetVASs.map((targetVas: OrderVas) => {
        return {
          ...targetVas,
          status: ORDER_VAS_STATUS.PROCESSING,
          updater: context.state.user
        }
      })
      await getRepository(OrderVas).save(targetVASs)

      /**
       * 4. Update VAS Order if it's pure VAS Order (status: READY_TO_PROCESS => PROCESSING)
       */
      if (foundVasOrder && foundVasOrder.id) {
        await getRepository(VasOrder).save({
          ...foundVasOrder,
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
        startedAt: `now()`,
        updater: context.state.user
      })
    })
  }
}
