import { ArrivalNotice, OrderProduct } from '@things-factory/sales-base'
import { getManager, getRepository } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { ORDER_PRODUCT_STATUS, ORDER_STATUS, WORKSHEET_STATUS } from '../../../enum'

export const activateUnloading = {
  async activateUnloading(_: any, { name, unloadingWorksheetDetails }, context: any) {
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
      if (foundWorksheet.status !== WORKSHEET_STATUS.DEACTIVATED)
        throw new Error('Status is not suitable for unloading')

      /**
       * 2. Update description of product worksheet details
       */
      await Promise.all(
        unloadingWorksheetDetails.map(async (productWorksheetDetail: WorksheetDetail) => {
          await getRepository(WorksheetDetail).update(
            {
              domain: context.state.domain,
              name: productWorksheetDetail.name
            },
            {
              description: productWorksheetDetail.description,
              updater: context.state.user
            }
          )
        })
      )

      /**
       * 3. Update order product (status: READY_TO_UNLOAD => UNLOADING)
       */
      const foundProductWorksheetDetails: WorksheetDetail[] = foundWorksheet.worksheetDetails.filter(
        (worksheetDetail: WorksheetDetail) => worksheetDetail.targetProduct
      )
      await Promise.all(
        foundProductWorksheetDetails.map(async (productWorksheetDetail: WorksheetDetail) => {
          await getRepository(OrderProduct).update(
            {
              id: productWorksheetDetail.targetProduct.id
            },
            {
              status: ORDER_PRODUCT_STATUS.UNLOADING,
              updater: context.state.user
            }
          )
        })
      )

      /**
       * 4. Update Arrival Notice (status: READY_TO_UNLOAD => PROCESSING)
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
