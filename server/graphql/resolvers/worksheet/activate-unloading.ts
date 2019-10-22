import { Bizplace } from '@things-factory/biz-base'
import {
  ArrivalNotice,
  OrderProduct,
  ORDER_PRODUCT_STATUS,
  ORDER_STATUS,
  ORDER_TYPES,
  ORDER_VAS_STATUS,
  OrderNoGenerator,
  OrderVas
} from '@things-factory/sales-base'
import { getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { WorksheetNoGenerator } from '../../../utils/worksheet-no-generator'

export const activateUnloading = {
  async activateUnloading(_: any, { worksheetNo, unloadingWorksheetDetails }, context: any) {
    return await getManager().transaction(async trxMgr => {
      /**
       * 1. Validation for worksheet
       *    - data existing
       *    - status of worksheet
       */
      const foundWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
        where: {
          domain: context.state.domain,
          name: worksheetNo,
          type: WORKSHEET_TYPE.UNLOADING,
          status: WORKSHEET_STATUS.DEACTIVATED
        },
        relations: ['bizplace', 'arrivalNotice', 'worksheetDetails', 'worksheetDetails.targetProduct']
      })

      if (!foundWorksheet) throw new Error(`Worksheet doesn't exists`)
      const customerBizplace: Bizplace = foundWorksheet.bizplace
      const foundWSDs: WorksheetDetail[] = foundWorksheet.worksheetDetails
      let targetProducts: OrderProduct[] = foundWSDs.map((foundWSD: WorksheetDetail) => {
        return {
          ...foundWSD.targetProduct,
          palletQty: foundWSD.targetProduct.palletQty
            ? foundWSD.targetProduct.palletQty
            : unloadingWorksheetDetails.find(
                (worksheetDetail: WorksheetDetail) => worksheetDetail.name === foundWSD.name
              ).palletQty
        }
      })

      /**
       * 2. Update description of product worksheet details (status: DEACTIVATED => EXECUTING)
       */
      await Promise.all(
        unloadingWorksheetDetails.map(async (unloadingWSD: WorksheetDetail) => {
          await trxMgr.getRepository(WorksheetDetail).update(
            {
              domain: context.state.domain,
              bizplace: customerBizplace,
              name: unloadingWSD.name,
              status: WORKSHEET_STATUS.DEACTIVATED,
              worksheet: foundWorksheet
            },
            {
              description: unloadingWSD.description,
              status: WORKSHEET_STATUS.EXECUTING,
              updater: context.state.user
            }
          )
        })
      )

      /**
       * 3. Update target products (status: READY_TO_UNLOAD => UNLOADING)
       */
      targetProducts = targetProducts.map((targetProduct: OrderProduct) => {
        return {
          ...targetProduct,
          status: ORDER_PRODUCT_STATUS.UNLOADING,
          updater: context.state.user
        }
      })
      await trxMgr.getRepository(OrderProduct).save(targetProducts)

      /**
       * 4. Update Arrival Notice (status: READY_TO_UNLOAD => PROCESSING)
       */
      const arrivalNotice: ArrivalNotice = foundWorksheet.arrivalNotice
      await trxMgr.getRepository(ArrivalNotice).save({
        ...arrivalNotice,
        status: ORDER_STATUS.PROCESSING,
        updater: context.state.user
      })

      /**
       * 5. Is VAS worksheet creating needed? (If there's some palletQty and palletizingDescription)
       *  - For loosen product case. (Without vas relation but description from palletizingDescription)
       *  - 5. 1) Check if there's VAS worksheet which is related with current arrival notice
       *          - YES => Append more VAS worksheet
       *          - NO => create additional VAS worksheet
       *  - 5. 2) Append new vas worksheet details
       */

      // Check there's some pallet qty and palletizingDescription => need to create vas worksheet
      if (
        unloadingWorksheetDetails.some(
          (worksheetDetail: any) => worksheetDetail.palletQty && worksheetDetail.palletizingDescription
        )
      ) {
        // Check if there's VAS worksheet which is related with current arrival notice order.
        let relatedVasWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
          where: { domain: context.state.domain, arrivalNotice, type: ORDER_TYPES.VAS_ORDER }
        })

        if (!relatedVasWorksheet) {
          relatedVasWorksheet = await trxMgr.getRepository(Worksheet).save({
            domain: context.state.domain,
            bizplace: customerBizplace,
            name: WorksheetNoGenerator.vas(),
            arrivalNotice,
            statedAt: new Date(),
            endedAt: new Date(),
            type: WORKSHEET_TYPE.VAS,
            status: WORKSHEET_STATUS.DONE,
            creator: context.state.user,
            updater: context.state.user
          })
        }

        let palletizingOrderVass: OrderVas[] = unloadingWorksheetDetails
          .filter((worksheetDetail: any) => worksheetDetail.palletQty && worksheetDetail.palletizingDescription)
          .map((worksheetDetail: any) => {
            return {
              domain: context.state.domain,
              name: OrderNoGenerator.orderVas(),
              arrivalNotice,
              description: worksheetDetail.palletizingDescription,
              batchId: worksheetDetail.batchId,
              bizplace: customerBizplace,
              type: ORDER_TYPES.ARRIVAL_NOTICE,
              status: ORDER_VAS_STATUS.DONE
            }
          })

        palletizingOrderVass = await trxMgr.getRepository(OrderVas).save(palletizingOrderVass)

        const palletizingWorksheetDetails = palletizingOrderVass.map((ov: OrderVas) => {
          return {
            domain: context.state.domain,
            bizplace: customerBizplace,
            worksheet: relatedVasWorksheet,
            name: WorksheetNoGenerator.vasDetail(),
            targetVas: ov,
            type: WORKSHEET_TYPE.VAS,
            status: WORKSHEET_STATUS.DONE,
            creator: context.state.user,
            updater: context.state.user
          }
        })

        await trxMgr.getRepository(WorksheetDetail).save(palletizingWorksheetDetails)
      }

      /**
       * 5. Update Worksheet (status: DEACTIVATED => EXECUTING)
       */
      return await trxMgr.getRepository(Worksheet).save({
        ...foundWorksheet,
        status: WORKSHEET_STATUS.EXECUTING,
        startedAt: new Date(),
        updater: context.state.user
      })
    })
  }
}
