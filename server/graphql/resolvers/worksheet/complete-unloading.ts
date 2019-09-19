import { ArrivalNotice, Bizplace, OrderProduct } from '@things-factory/sales-base'
import { Equal, getManager, getRepository, In, Not } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { ORDER_PRODUCT_STATUS, ORDER_STATUS, WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../enum'

export const completeUnloading = {
  async completeUnloading(_: any, { arrivalNoticeNo }, context: any) {
    return await getManager().transaction(async transactionalEntityManager => {
      /**
       * 1. Validation for worksheet
       *    - data existing
       *    - status of worksheet
       */
      const foundUnloadingWorksheet: Worksheet = await getRepository(Worksheet).findOne({
        where: {
          domain: context.state.domain,
          bizplace: In(context.state.bizplaces.map((bizplace: Bizplace) => bizplace.id)),
          status: WORKSHEET_STATUS.EXECUTING,
          type: WORKSHEET_TYPE.UNLOADING,
          arrivalNoticeNo
        },
        relations: [
          'domain',
          'bizplace',
          'arrivalNotice',
          'worksheetDetails',
          'worksheetDetails.fromLocation',
          'worksheetDetails.fromLocation.warehouse',
          'worksheetDetails.toLocation',
          'worksheetDetails.toLocation.warehouse',
          'worksheetDetails.targetProduct',
          'worksheetDetails.targetProduct.product',
          'creator',
          'updater'
        ]
      })

      if (!foundUnloadingWorksheet) throw new Error(`Worksheet doesn't exists.`)
      if (foundUnloadingWorksheet.status !== WORKSHEET_STATUS.EXECUTING)
        throw new Error('Status is not suitable to complete unloading')

      /**
       * 2. Update order product (status: UNLOADING => UNLOADED)
       */
      const unloadingWorksheetDetails: WorksheetDetail[] = foundUnloadingWorksheet.worksheetDetails
      await Promise.all(
        unloadingWorksheetDetails.map(async (unloadingWorksheetDetail: WorksheetDetail) => {
          transactionalEntityManager.getRepository(OrderProduct).update(
            {
              id: unloadingWorksheetDetail.targetProduct.id
            },
            {
              ...unloadingWorksheetDetail.targetProduct,
              status: ORDER_PRODUCT_STATUS.UNLOADED,
              updater: context.state.user
            }
          )
        })
      )

      /**
       * 3. Update worksheet status (status: UNLOADING => DONE)
       */
      transactionalEntityManager.getRepository(Worksheet).save({
        ...foundUnloadingWorksheet,
        status: WORKSHEET_STATUS.DONE,
        endedAt: Date.now(),
        updater: context.state.user
      })

      /**
       * 4. Check whether every related worksheet is completed
       *    - if yes => Update Status of arrival notice
       */
      const foundVasWorksheet: Worksheet = await getRepository(Worksheet).findOne({
        where: {
          domain: context.state.domain,
          bizplace: In(context.state.bizplaces.map((bizplace: Bizplace) => bizplace.id)),
          status: Not(Equal(WORKSHEET_STATUS.DONE)),
          type: WORKSHEET_TYPE.VAS,
          arrivalNoticeNo
        },
        relations: [
          'domain',
          'bizplace',
          'arrivalNotice',
          'worksheetDetails',
          'worksheetDetails.fromLocation',
          'worksheetDetails.fromLocation.warehouse',
          'worksheetDetails.toLocation',
          'worksheetDetails.toLocation.warehouse',
          'worksheetDetails.targetVas',
          'worksheetDetails.targetVas.vas',
          'creator',
          'updater'
        ]
      })

      if (!foundVasWorksheet) {
        await transactionalEntityManager.getRepository(ArrivalNotice).update(
          {
            domain: context.state.domain,
            name: arrivalNoticeNo
          },
          {
            status: ORDER_STATUS.READY_TO_PUTAWAY,
            updater: context.status.user
          }
        )
      }

      return foundUnloadingWorksheet
    })
  }
}
