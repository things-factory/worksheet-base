import { ArrivalNotice, Bizplace, OrderProduct, OrderVas } from '@things-factory/sales-base'
import { getManager, In } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { ORDER_STATUS, ORDER_PRODUCT_STATUS, ORDER_VAS_STATUS, WORKSHEET_STATUS } from '../../../enum'

export const activateUnloading = {
  async activateUnloading(_: any, { name, productWorksheetDetails, vasWorksheetDetails }, context: any) {
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
        relations: ['arrivalNotice', 'worksheetDetails', 'worksheetDetails.targetProduct', 'worksheetDetails.targetVas']
      })

      if (!foundWorksheet) throw new Error(`Worksheet doesn't exists`)
      if (foundWorksheet.status !== WORKSHEET_STATUS.DEACTIVATED)
        throw new Error('Status is not suitable for unloading')

      /**
       * 2. Update remark of product worksheet details details
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
              remark: productWorksheetDetail.remark
            }
          )
        })
      )

      /**
       * 3. Update remark of vas worksheet details details
       */
      await Promise.all(
        vasWorksheetDetails.map(async (vasWorksheetDetail: WorksheetDetail) => {
          await transactionalEntityManager.getRepository(WorksheetDetail).update(
            {
              name: vasWorksheetDetail.name,
              domain: context.state.domain,
              bizplace: In(context.state.bizplaces.map((bizplace: Bizplace) => bizplace.id))
            },
            {
              remark: vasWorksheetDetail.remark
            }
          )
        })
      )

      /**
       * 4. Update order product (status: READY_TO_UNLOAD => UNLOADING)
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
              status: ORDER_PRODUCT_STATUS.UNLOADING
            }
          )
        })
      )

      /**
       * 5. Update order vas (status: READY_TO_PROCESS => PROCESSING)
       */
      const foundVasWorksheetDetails: WorksheetDetail[] = foundWorksheet.worksheetDetails.filter(
        (worksheetDetail: WorksheetDetail) => worksheetDetail.targetVas
      )
      await Promise.all(
        foundVasWorksheetDetails.map(async (vasWorksheetDetail: WorksheetDetail) => {
          await transactionalEntityManager.getRepository(OrderVas).update(
            {
              id: vasWorksheetDetail.targetVas.id
            },
            {
              status: ORDER_VAS_STATUS.PROCESSING
            }
          )
        })
      )

      /**
       * 6. Update Arrival Notice (status: READY_TO_UNLOAD => )
       */
      const arrivalNotice: ArrivalNotice = foundWorksheet.arrivalNotice
      await transactionalEntityManager.getRepository(ArrivalNotice).save({
        ...arrivalNotice,
        status: ORDER_STATUS.PROCESSING,
        updater: context.state.user
      })

      /**
       * 7. Update Worksheet (status: DEACTIVATED => EXECUTING)
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
