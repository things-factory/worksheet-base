import { ArrivalNotice, Bizplace, OrderProduct } from '@things-factory/sales-base'
import { Equal, getManager, getRepository, In, Not } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { ORDER_PRODUCT_STATUS, ORDER_STATUS, WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../enum'

export const completeUnloading = {
  async completeUnloading(_: any, { arrivalNoticeNo, worksheetDetails }, context: any) {
    return await getManager().transaction(async transactionalEntityManager => {
      /**
       * 1. Validation for worksheet
       *    - data existing
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
          'worksheetDetails.targetProduct',
          'worksheetDetails.targetProduct.product',
          'creator',
          'updater'
        ]
      })

      if (!foundUnloadingWorksheet) throw new Error(`Worksheet doesn't exists.`)

      /**
       * 2. Update worksheet detail and order product
       *    - worksheet detail: Update remark if it's exists
       *    - order product: Update actual qty
       */
      await Promise.all(
        worksheetDetails.map(async (worksheetDetail: WorksheetDetail) => {
          await transactionalEntityManager.getRepository(WorksheetDetail).update(
            {
              id: worksheetDetail.id
            },
            {
              remark: worksheetDetail.remark,
              updater: context.state.user
            }
          )

          await transactionalEntityManager.getRepository(OrderProduct).update(
            {
              id: worksheetDetail.targetProduct.id
            },
            {
              actualQty: worksheetDetail.targetProduct.actualQty,
              status: ORDER_PRODUCT_STATUS.UNLOADED,
              updater: context.state.user
            }
          )
        })
      )

      /**
       * 3. Update worksheet status (status: UNLOADING => DONE)
       */
      await transactionalEntityManager.getRepository(Worksheet).save({
        ...foundUnloadingWorksheet,
        status: WORKSHEET_STATUS.DONE,
        endedAt: Date.now(),
        updater: context.state.user
      })

      /**
       * 4. Check whether every related worksheet is completed
       *    - if yes => Update Status of arrival notice
       */
      const foundVasWorksheets: Worksheet[] = await getRepository(Worksheet).find({
        where: {
          domain: context.state.domain,
          bizplace: In(context.state.bizplaces.map((bizplace: Bizplace) => bizplace.id)),
          status: Not(Equal(WORKSHEET_STATUS.DONE)),
          type: WORKSHEET_TYPE.VAS,
          name: arrivalNoticeNo
        }
      })

      if (!foundVasWorksheets || foundVasWorksheets.length === 0) {
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
