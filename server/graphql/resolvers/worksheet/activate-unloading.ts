import { ArrivalNotice, Bizplace, OrderProduct } from '@things-factory/sales-base'
import { getManager, In } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { ORDER_PRODUCT_STATUS, ORDER_STATUS, WORKSHEET_STATUS } from '../../../enum'

export const activateUnloading = {
  async activateUnloading(_: any, { name, productWorksheetDetails }, context: any) {
    return await getManager().transaction(async transactionalEntityManager => {
      /**
       * 1. Validation for worksheet
       *    - data existing
       *    - status of worksheet
       */
      const foundWorksheet: Worksheet = await transactionalEntityManager.getRepository(Worksheet).findOne({
        where: {
          domain: context.state.domain,
          bizplace: In(context.state.bizplaces.map((bizplace: Bizplace) => bizplace.id)),
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
        productWorksheetDetails.map(async (productWorksheetDetail: WorksheetDetail) => {
          await transactionalEntityManager.getRepository(WorksheetDetail).update(
            {
              name: productWorksheetDetail.name,
              domain: context.state.domain,
              bizplace: In(context.state.bizplaces.map((bizplace: Bizplace) => bizplace.id))
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
          await transactionalEntityManager.getRepository(OrderProduct).update(
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
      await transactionalEntityManager.getRepository(ArrivalNotice).save({
        ...arrivalNotice,
        status: ORDER_STATUS.PROCESSING,
        updater: context.state.user
      })

      /**
       * 5. Update Worksheet (status: DEACTIVATED => EXECUTING)
       */
      return await transactionalEntityManager.getRepository(Worksheet).save({
        ...foundWorksheet,
        status: WORKSHEET_STATUS.EXECUTING,
        startedAt: Date.now(),
        updater: context.state.user
      })
    })
  }
}
