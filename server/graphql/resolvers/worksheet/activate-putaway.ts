import { ArrivalNotice, ORDER_STATUS } from '@things-factory/sales-base'
import { Location } from '@things-factory/warehouse-base'
import { getManager, getRepository } from 'typeorm'
import { WORKSHEET_STATUS } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const activatePutaway = {
  async activatePutaway(_: any, { worksheetNo, putawayWorksheetDetails }, context: any) {
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
        relations: ['arrivalNotice', 'worksheetDetails', 'worksheetDetails.targetInventory']
      })

      if (!foundWorksheet) throw new Error(`Worksheet doesn't exists`)

      /**
       * 2. Update description of putaway worksheet details
       */
      await Promise.all(
        putawayWorksheetDetails.map(async (putawayWorksheetDetail: WorksheetDetail) => {
          await getRepository(WorksheetDetail).update(
            {
              domain: context.state.domain,
              name: putawayWorksheetDetail.name,
              status: WORKSHEET_STATUS.DEACTIVATED
            },
            {
              description: putawayWorksheetDetail.description,
              status: WORKSHEET_STATUS.EXECUTING,
              updater: context.state.user
            }
          )
        })
      )

      /**
       * 4. Update putaway Worksheet (status: DEACTIVATED => EXECUTING)
       */
      const worksheet: Worksheet = await getRepository(Worksheet).save({
        ...foundWorksheet,
        status: WORKSHEET_STATUS.EXECUTING,
        startedAt: Math.floor(Date.now() / 1000),
        updater: context.state.user
      })

      /**
       * 5. Update Arrival Notice (status: READY_TO_PUTAWAY => PUTTING_AWAY)
       */
      const arrivalNotice: ArrivalNotice = foundWorksheet.arrivalNotice
      await getRepository(ArrivalNotice).save({
        ...arrivalNotice,
        status: ORDER_STATUS.PUTTING_AWAY,
        updater: context.state.user
      })

      return worksheet
    })
  }
}
