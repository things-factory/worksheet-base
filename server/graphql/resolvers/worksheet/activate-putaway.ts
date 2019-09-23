import { ArrivalNotice, OrderProduct } from '@things-factory/sales-base'
import { Location } from '@things-factory/warehouse-base'
import { getManager, getRepository } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { ORDER_PRODUCT_STATUS, ORDER_STATUS, WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../enum'

export const activatePutaway = {
  async activatePutaway(_: any, { name, putawayWorksheetDetails }, context: any) {
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
        relations: ['arrivalNotice', 'worksheetDetails', 'worksheetDetails.targetProduct']
      })

      if (!foundWorksheet) throw new Error(`Worksheet doesn't exists`)
      if (foundWorksheet.status !== WORKSHEET_STATUS.DEACTIVATED && foundWorksheet.type === WORKSHEET_TYPE.PUTAWAY)
        throw new Error('Status is not suitable for putaway')

      /**
       * 2. Update description of product worksheet details
       */
      await Promise.all(
        putawayWorksheetDetails.map(async (putawayWorksheetDetail: WorksheetDetail) => {
          await getRepository(WorksheetDetail).update(
            {
              domain: context.state.domain,
              name: putawayWorksheetDetail.name
            },
            {
              description: putawayWorksheetDetail.description,
              toLocation: await getRepository(Location).findOne({
                where: { domain: context.state.domain, id: putawayWorksheetDetail.toLocation.id }
              }),
              updater: context.state.user
            }
          )
        })
      )

      /**
       * 3. Update order product (status: UNLOADED => READY_TO_PUTAWAY)
       */
      const foundPutawayWorksheetDetails: WorksheetDetail[] = foundWorksheet.worksheetDetails.filter(
        (worksheetDetail: WorksheetDetail) => worksheetDetail.targetProduct
      )
      await Promise.all(
        foundPutawayWorksheetDetails.map(async (putawayWorksheetDetail: WorksheetDetail) => {
          await getRepository(OrderProduct).update(
            {
              id: putawayWorksheetDetail.targetProduct.id,
              status: ORDER_PRODUCT_STATUS.UNLOADED
            },
            {
              status: ORDER_PRODUCT_STATUS.PUTTING_AWAY,
              updater: context.state.user
            }
          )
        })
      )

      /**
       * 4. Update Arrival Notice (status: READY_TO_PUTAWAY => PROCESSING)
       */
      const arrivalNotice: ArrivalNotice = foundWorksheet.arrivalNotice
      await getRepository(ArrivalNotice).save({
        ...arrivalNotice,
        status: ORDER_STATUS.PROCESSING,
        updater: context.state.user
      })

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
