import { ArrivalNotice, OrderProduct } from '@things-factory/sales-base'
import { Equal, getManager, getRepository, Not } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { ORDER_PRODUCT_STATUS, ORDER_STATUS, WORKSHEET_STATUS, WORKSHEET_TYPE, INVENTORY_STATUS } from '../../../enum'
import { Inventory } from '@things-factory/warehouse-base'
import { InventoryNoGenerator } from '../../../utils/inventory-no-generator'
import { userInfo } from 'os'

export const completePutaway = {
  async completePutaway(_: any, { arrivalNoticeNo, putawayWorksheetDetails }, context: any) {
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

      const foundPutawayWorksheet: Worksheet = await getRepository(Worksheet).findOne({
        where: {
          domain: context.state.domain,
          bizplace: arrivalNotice.bizplace,
          status: WORKSHEET_STATUS.EXECUTING,
          type: WORKSHEET_TYPE.PUTAWAY,
          arrivalNotice
        },
        relations: [
          'bizplace',
          'arrivalNotice',
          'worksheetDetails',
          'worksheetDetails.targetProduct',
          'worksheetDetails.targetProduct.product',
          'creator',
          'updater'
        ]
      })

      if (!foundPutawayWorksheet) throw new Error(`Worksheet doesn't exists.`)

      /**
       * 2. Update worksheet detail and order product
       *    - worksheet detail: Update remark if it's exists
       *    - order product: Update actual qty & status
       */
      await Promise.all(
        putawayWorksheetDetails.map(async (worksheetDetail: WorksheetDetail) => {
          await getRepository(OrderProduct).update(
            {
              domain: context.state.domain,
              name: worksheetDetail.targetProduct.name,
              arrivalNotice
            },
            {
              actualPackQty: worksheetDetail.targetProduct.actualPackQty,
              status: ORDER_PRODUCT_STATUS.STORED,
              updater: context.state.user
            }
          )
        })
      )

      /**
       * 3. Check whether every related worksheet is completed
       *    - if yes => Update Status of arrival notice
       */
      const relatedWorksheets: Worksheet[] = await getRepository(Worksheet).find({
        where: {
          domain: context.state.domain,
          bizplace: foundPutawayWorksheet.bizplace,
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
            status: ORDER_STATUS.DONE,
            updater: context.status.user
          }
        )
      }

      /**
       * 4. Create inventory data
       */
      const completedPutwayworksheet: Worksheet = await getRepository(Worksheet).findOne({
        where: {
          domain: context.state.domain,
          bizplace: arrivalNotice.bizplace,
          status: WORKSHEET_STATUS.EXECUTING,
          type: WORKSHEET_TYPE.PUTAWAY,
          arrivalNotice
        },
        relations: [
          'bizplace',
          'worksheetDetails',
          'worksheetDetails.targetProduct',
          'worksheetDetails.targetProduct.product'
        ]
      })

      const completedPutwayworksheetDetails: WorksheetDetail[] = completedPutwayworksheet.worksheetDetails
      await Promise.all(
        completedPutwayworksheetDetails.map(async (completedPutawayWSD: WorksheetDetail) => {
          await getRepository(Inventory).save({
            domain: context.state.domain,
            bizplace: completedPutawayWSD.bizplace,
            product: completedPutawayWSD.targetProduct.product,
            startQty: completedPutawayWSD.targetProduct.packQty,
            endQty: completedPutawayWSD.targetProduct.actualPackQty,
            status: INVENTORY_STATUS.OCCUPIED,
            creator: context.state.user,
            updater: context.state.user
          })
        })
      )

      /**
       * 5. Update worksheet status (status: EXECUTING => DONE)
       */
      await getRepository(Worksheet).save({
        ...foundPutawayWorksheet,
        status: WORKSHEET_STATUS.DONE,
        endedAt: Date.now(),
        updater: context.state.user
      })

      return foundPutawayWorksheet
    })
  }
}
