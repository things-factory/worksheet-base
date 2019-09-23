import { ArrivalNotice, OrderProduct } from '@things-factory/sales-base'
import { Equal, getManager, getRepository, Not } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { ORDER_PRODUCT_STATUS, ORDER_STATUS, WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../enum'
import { WorksheetNoGenerator } from '../../../utils/worksheet-no-generator'

export const completeUnloading = {
  async completeUnloading(_: any, { arrivalNoticeNo, unloadingWorksheetDetails }, context: any) {
    return await getManager().transaction(async () => {
      /**
       * 1. Validation for worksheet
       *    - data existing
       */
      const arrivalNotice: ArrivalNotice = await getRepository(ArrivalNotice).findOne({
        where: { domain: context.state.domain, name: arrivalNoticeNo },
        relations: ['bizplace']
      })

      if (!arrivalNotice) throw new Error(`ArrivalNotice doesn't exists.`)

      const foundUnloadingWorksheet: Worksheet = await getRepository(Worksheet).findOne({
        where: {
          domain: context.state.domain,
          bizplace: arrivalNotice.bizplace,
          status: WORKSHEET_STATUS.EXECUTING,
          type: WORKSHEET_TYPE.UNLOADING,
          arrivalNotice
        },
        relations: [
          'domain',
          'bizplace',
          'arrivalNotice',
          'worksheetDetails',
          'worksheetDetails.toLocation',
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
       *    - order product: Update actual qty & status
       */
      await Promise.all(
        unloadingWorksheetDetails.map(async (worksheetDetail: WorksheetDetail) => {
          await getRepository(WorksheetDetail).update(
            {
              domain: context.state.domain,
              name: worksheetDetail.name,
              bizplace: foundUnloadingWorksheet.bizplace
            },
            {
              remark: worksheetDetail.remark,
              updater: context.state.user
            }
          )

          await getRepository(OrderProduct).update(
            {
              domain: context.state.domain,
              name: worksheetDetail.targetProduct.name,
              arrivalNotice
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
       * 3. Update worksheet status (status: EXECUTING => DONE)
       */
      await getRepository(Worksheet).save({
        ...foundUnloadingWorksheet,
        status: WORKSHEET_STATUS.DONE,
        endedAt: Date.now(),
        updater: context.state.user
      })

      /**
       * 4. Check whether every related worksheet is completed
       *    - if yes => Update Status of arrival notice
       */
      const relatedWorksheets: Worksheet[] = await getRepository(Worksheet).find({
        where: {
          domain: context.state.domain,
          bizplace: foundUnloadingWorksheet.bizplace,
          status: Not(Equal(WORKSHEET_STATUS.DONE)),
          arrivalNotice
        }
      })

      if (!relatedWorksheets || relatedWorksheets.length === 0) {
        await getRepository(ArrivalNotice).update(
          {
            domain: context.state.domain,
            bizplace: arrivalNotice.bizplace,
            name: arrivalNotice.name
          },
          {
            status: ORDER_STATUS.READY_TO_PUTAWAY,
            updater: context.status.user
          }
        )
      }

      /**
       * 5. Create putaway worksheet
       *
       */

      const putawayWorksheet = await getRepository(Worksheet).save({
        domain: context.state.domain,
        arrivalNotice: arrivalNotice,
        bizplace: foundUnloadingWorksheet.bizplace,
        name: WorksheetNoGenerator.putaway(),
        type: WORKSHEET_TYPE.PUTAWAY,
        status: WORKSHEET_STATUS.DEACTIVATED
      })

      await Promise.all(
        await foundUnloadingWorksheet.worksheetDetails.map(async (worksheetDetail: WorksheetDetail) => {
          await getRepository(WorksheetDetail).save({
            domain: context.state.domain,
            bizplace: worksheetDetail.bizplace,
            name: WorksheetNoGenerator.putawayDetail(),
            type: WORKSHEET_TYPE.PUTAWAY,
            worksheet: putawayWorksheet,
            fromLocation: worksheetDetail.toLocation,
            targetProduct: worksheetDetail.targetProduct
          })
        })
      )

      return foundUnloadingWorksheet
    })
  }
}
