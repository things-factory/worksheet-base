import { Bizplace } from '@things-factory/biz-base'
import { ArrivalNotice, OrderProduct, ORDER_PRODUCT_STATUS, ORDER_STATUS } from '@things-factory/sales-base'
import { Inventory } from '@things-factory/warehouse-base'
import { Equal, getManager, getRepository, In, Not } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { WorksheetNoGenerator } from '../../../utils/worksheet-no-generator'

export const completeUnloading = {
  async completeUnloading(_: any, { arrivalNoticeNo, worksheetDetails }, context: any) {
    return await getManager().transaction(async () => {
      /**
       * 1. Validation for worksheet
       *    - data existing
       */
      const arrivalNotice: ArrivalNotice = await getRepository(ArrivalNotice).findOne({
        where: { domain: context.state.domain, name: arrivalNoticeNo, status: ORDER_STATUS.PROCESSING },
        relations: ['bizplace']
      })

      if (!arrivalNotice) throw new Error(`ArrivalNotice doesn't exists.`)
      const customerBizplace: Bizplace = arrivalNotice.bizplace

      const foundWorksheet: Worksheet = await getRepository(Worksheet).findOne({
        where: {
          domain: context.state.domain,
          bizplace: customerBizplace,
          status: WORKSHEET_STATUS.EXECUTING,
          type: WORKSHEET_TYPE.UNLOADING,
          arrivalNotice
        },
        relations: ['bufferLocation', 'worksheetDetails', 'worksheetDetails.targetProduct']
      })

      if (!foundWorksheet) throw new Error(`Worksheet doesn't exists.`)
      const foundWorksheetDetails: WorksheetDetail[] = foundWorksheet.worksheetDetails
      let targetProducts: OrderProduct[] = foundWorksheetDetails.map(
        (foundWSD: WorksheetDetail) => foundWSD.targetProduct
      )

      /**
       * 3. Update worksheet status (status: EXECUTING => DONE)
       */
      await getRepository(Worksheet).save({
        ...foundWorksheet,
        status: WORKSHEET_STATUS.DONE,
        endedAt: `now()`,
        updater: context.state.user
      })

      /**
       * 4. Update worksheet detail status (EXECUTING => DONE) & issue note
       */
      await Promise.all(
        foundWorksheetDetails.map(async (worksheetDetail: WorksheetDetail) => {
          const patchedWD: WorksheetDetail = worksheetDetails.filter(
            (patchedWD: WorksheetDetail) => patchedWD.name === worksheetDetail.name
          )[0]
          if (patchedWD.issue) worksheetDetail.issue = patchedWD.issue

          await getRepository(WorksheetDetail).save({
            ...worksheetDetail,
            status: WORKSHEET_STATUS.DONE,
            updater: context.state.user
          })
        })
      )

      /**
       * 5. Update target products status (UNLOADING => DONE)
       */
      targetProducts = targetProducts.map((targetProduct: OrderProduct) => {
        return {
          ...targetProduct,
          status: ORDER_PRODUCT_STATUS.DONE,
          updater: context.state.user
        }
      })
      await getRepository(OrderProduct).save(targetProducts)

      /**
       * 6. Check whether every related worksheet is completed
       *    - if yes => Update Status of arrival notice
       *    - VAS doesn't affect to status of arrival notice
       */
      const relatedWorksheets: Worksheet[] = await getRepository(Worksheet).find({
        where: {
          domain: context.state.domain,
          bizplace: customerBizplace,
          status: Not(Equal(WORKSHEET_STATUS.DONE)),
          type: Not(In([WORKSHEET_TYPE.VAS])),
          arrivalNotice
        }
      })

      if (relatedWorksheets.length === 0) {
        await getRepository(ArrivalNotice).update(
          {
            domain: context.state.domain,
            bizplace: customerBizplace,
            name: arrivalNotice.name,
            status: ORDER_STATUS.PROCESSING
          },
          {
            status: ORDER_STATUS.READY_TO_PUTAWAY,
            updater: context.status.user
          }
        )
      }

      /**
       * 7. Create putaway worksheet
       */
      const putawayWorksheet = await getRepository(Worksheet).save({
        domain: context.state.domain,
        arrivalNotice: arrivalNotice,
        bizplace: customerBizplace,
        name: WorksheetNoGenerator.putaway(),
        type: WORKSHEET_TYPE.PUTAWAY,
        status: WORKSHEET_STATUS.DEACTIVATED,
        bufferLocation: foundWorksheet.bufferLocation,
        creator: context.state.user,
        updater: context.state.user
      })

      await Promise.all(
        foundWorksheetDetails.map(async (worksheetDetail: WorksheetDetail) => {
          const inventories: Inventory[] = await getRepository(Inventory).find({
            where: {
              domain: context.state.domain,
              bizplace: customerBizplace,
              batchId: worksheetDetail.targetProduct.batchId,
              location: foundWorksheet.bufferLocation
            },
            relations: ['product', 'warehouse', 'location']
          })

          await Promise.all(
            inventories.map(async (inventory: Inventory) => {
              await getRepository(WorksheetDetail).save({
                domain: context.state.domain,
                bizplace: customerBizplace,
                name: WorksheetNoGenerator.putawayDetail(),
                type: WORKSHEET_TYPE.PUTAWAY,
                worksheet: putawayWorksheet,
                targetInventory: inventory,
                fromLocation: foundWorksheet.bufferLocation,
                status: WORKSHEET_STATUS.DEACTIVATED,
                creator: context.state.user,
                updater: context.state.user
              })
            })
          )
        })
      )

      return foundWorksheet
    })
  }
}
