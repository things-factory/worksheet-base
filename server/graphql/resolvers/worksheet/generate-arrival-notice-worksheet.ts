import {
  ArrivalNotice,
  OrderProduct,
  OrderVas,
  ORDER_PRODUCT_STATUS,
  ORDER_STATUS,
  ORDER_VAS_STATUS
} from '@things-factory/sales-base'
import { Location } from '@things-factory/warehouse-base'
import { getManager, getRepository } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { WorksheetNoGenerator } from '../../../utils/worksheet-no-generator'
import { Bizplace } from '@things-factory/biz-base'

export const generateArrivalNoticeWorksheet = {
  async generateArrivalNoticeWorksheet(_: any, { arrivalNoticeNo, bufferLocation }, context: any) {
    return await getManager().transaction(async () => {
      /**
       * 1. Validation for arrival notice
       *    - data existing
       *    - status of arrival notice
       */
      const foundArrivalNotice: ArrivalNotice = await getRepository(ArrivalNotice).findOne({
        where: { domain: context.state.domain, name: arrivalNoticeNo, status: ORDER_STATUS.ARRIVED },
        relations: ['bizplace', 'orderProducts', 'orderVass']
      })

      if (!foundArrivalNotice) throw new Error(`Arrival notice doesn't exists.`)
      const customerBizplace: Bizplace = foundArrivalNotice.bizplace
      let foundOPs: OrderProduct[] = foundArrivalNotice.orderProducts
      let foundOVs: OrderVas[] = foundArrivalNotice.orderVass

      if (!bufferLocation || !bufferLocation.id) throw new Error(`Can't find buffer location`)
      const foundBufferLoc: Location = await getRepository(Location).findOne(bufferLocation.id)
      if (!foundBufferLoc) throw new Error(`location doesn't exists.`)
      /*
       * 2. Create worksheet and worksheet details for products
       */
      // 2. 1) Create unloading worksheet
      const unloadingWorksheet = await getRepository(Worksheet).save({
        domain: context.state.domain,
        bizplace: customerBizplace,
        name: WorksheetNoGenerator.unloading(),
        bufferLocation: foundBufferLoc,
        arrivalNotice: foundArrivalNotice,
        type: WORKSHEET_TYPE.UNLOADING,
        status: WORKSHEET_STATUS.DEACTIVATED,
        creator: context.state.user,
        updater: context.state.user
      })

      // 2. 2) Create unloading worksheet details
      const unloadingWorksheetDetails = foundOPs.map((op: OrderProduct) => {
        return {
          domain: context.state.domain,
          bizplace: customerBizplace,
          worksheet: unloadingWorksheet,
          name: WorksheetNoGenerator.unloadingDetail(),
          targetProduct: op,
          type: WORKSHEET_TYPE.UNLOADING,
          status: WORKSHEET_STATUS.DEACTIVATED,
          creator: context.state.user,
          updater: context.state.user
        }
      })
      await getRepository(WorksheetDetail).save(unloadingWorksheetDetails)

      // 2. 3) Update status of order products (ARRIVED => READY_TO_UNLOAD)
      foundOPs = foundOPs.map((op: OrderProduct) => {
        return {
          ...op,
          status: ORDER_PRODUCT_STATUS.READY_TO_UNLOAD,
          updater: context.state.user
        }
      })
      await getRepository(OrderProduct).save(foundOPs)

      /**
       * 3. Create worksheet and worksheet details for vass (if it exists)
       */
      let vasWorksheet: Worksheet = new Worksheet()
      if (foundOVs && foundOVs.length) {
        // 2. 1) Create vas worksheet
        vasWorksheet = await getRepository(Worksheet).save({
          domain: context.state.domain,
          bizplace: customerBizplace,
          name: WorksheetNoGenerator.vas(),
          arrivalNotice: foundArrivalNotice,
          type: WORKSHEET_TYPE.VAS,
          status: WORKSHEET_STATUS.DEACTIVATED,
          creator: context.state.user,
          updater: context.state.user
        })

        // 2. 2) Create vas worksheet details
        const vasWorksheetDetails = foundOVs.map((ov: OrderVas) => {
          return {
            domain: context.state.domain,
            bizplace: customerBizplace,
            worksheet: vasWorksheet,
            name: WorksheetNoGenerator.vasDetail(),
            targetVas: ov,
            type: WORKSHEET_TYPE.VAS,
            status: WORKSHEET_STATUS.DEACTIVATED,
            creator: context.state.user,
            updater: context.state.user
          }
        })
        await getRepository(WorksheetDetail).save(vasWorksheetDetails)

        // 2. 3) Update status of order vas (ARRIVED => READY_TO_PROCESS)
        foundOVs = foundOVs.map((ov: OrderVas) => {
          return {
            ...ov,
            status: ORDER_VAS_STATUS.READY_TO_PROCESS,
            updater: context.state.user
          }
        })
        await getRepository(OrderVas).save(foundOVs)
      }

      /**
       * 5. Update status of arrival notice (ARRIVED => READY_TO_UNLOAD)
       */
      await getRepository(ArrivalNotice).save({
        ...foundArrivalNotice,
        status: ORDER_STATUS.READY_TO_UNLOAD,
        updater: context.state.user
      })

      /**
       * 6. Returning worksheet as a result
       */
      return {
        unloadingWorksheet,
        vasWorksheet
      }
    })
  }
}
