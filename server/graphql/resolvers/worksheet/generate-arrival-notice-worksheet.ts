import { ArrivalNotice, OrderProduct, OrderVas } from '@things-factory/sales-base'
import { Location } from '@things-factory/warehouse-base'
import { getManager, getRepository } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { ORDER_PRODUCT_STATUS, ORDER_STATUS, ORDER_VAS_STATUS, WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../enum'
import { WorksheetNoGenerator } from '../../../utils/worksheet-no-generator'

export const generateArrivalNoticeWorksheet = {
  async generateArrivalNoticeWorksheet(_: any, { arrivalNoticeNo, bufferLocation }, context: any) {
    return await getManager().transaction(async () => {
      /**
       * 1. Validation for arrival notice
       *    - data existing
       *    - status of arrival notice
       */
      const arrivalNotice: ArrivalNotice = await getRepository(ArrivalNotice).findOne({
        where: { domain: context.state.domain, name: arrivalNoticeNo },
        relations: ['bizplace', 'orderProducts', 'orderVass']
      })

      if (!arrivalNotice) throw new Error(`Arrival notice doesn't exists.`)
      if (arrivalNotice.status !== ORDER_STATUS.ARRIVED)
        throw new Error('Status is not suitable for getting ready to unload')

      /*
       * 2. Create worksheet and worksheet details for products
       */
      const orderProducts: [OrderProduct] = arrivalNotice.orderProducts
      let unloadingWorksheet: Worksheet = new Worksheet()
      if (orderProducts && orderProducts.length) {
        unloadingWorksheet = await getRepository(Worksheet).save({
          domain: context.state.domain,
          bizplace: arrivalNotice.bizplace,
          name: WorksheetNoGenerator.unloading(),
          bufferLocation: await getRepository(Location).findOne(bufferLocation.id),
          arrivalNotice: arrivalNotice,
          type: WORKSHEET_TYPE.UNLOADING,
          status: WORKSHEET_STATUS.DEACTIVATED,
          creator: context.state.user,
          updater: context.state.user
        })

        await Promise.all(
          orderProducts.map(async (orderProduct: OrderProduct) => {
            await getRepository(WorksheetDetail).save({
              domain: context.state.domain,
              bizplace: arrivalNotice.bizplace,
              worksheet: unloadingWorksheet,
              name: WorksheetNoGenerator.unloadingDetail(),
              targetProduct: orderProduct,
              type: WORKSHEET_TYPE.UNLOADING,
              status: WORKSHEET_STATUS.DEACTIVATED,
              creator: context.state.user,
              updater: context.state.user
            })

            // 3. 2) Update status of order products (ARRIVED => READY_TO_UNLOAD)
            return await getRepository(OrderProduct).update(
              {
                domain: context.state.domain,
                name: orderProduct.name,
                arrivalNotice: arrivalNotice
              },
              {
                ...orderProduct,
                status: ORDER_PRODUCT_STATUS.READY_TO_UNLOAD,
                updater: context.state.user
              }
            )
          })
        )
      }

      /**
       * 4. Create worksheet detail for vass (if it exists)
       */
      const orderVass: [OrderVas] = arrivalNotice.orderVass
      let vasWorksheet: Worksheet = new Worksheet()
      if (orderVass && orderVass.length) {
        vasWorksheet = await getRepository(Worksheet).save({
          domain: context.state.domain,
          bizplace: arrivalNotice.bizplace,
          name: WorksheetNoGenerator.vas(),
          arrivalNotice: arrivalNotice,
          type: WORKSHEET_TYPE.VAS,
          status: WORKSHEET_STATUS.DEACTIVATED,
          creator: context.state.user,
          updater: context.state.user
        })

        await Promise.all(
          orderVass.map(async (orderVas: OrderVas) => {
            await getRepository(WorksheetDetail).save({
              domain: context.state.domain,
              bizplace: arrivalNotice.bizplace,
              worksheet: vasWorksheet,
              name: WorksheetNoGenerator.vasDetail(),
              targetVas: orderVas,
              type: WORKSHEET_TYPE.VAS,
              status: WORKSHEET_STATUS.DEACTIVATED,
              creator: context.state.user,
              updater: context.state.user
            })

            // 4. 2) Update status of order vass (ARRIVED => READY_TO_PROCESS)
            await getRepository(OrderVas).update(
              {
                domain: context.state.domain,
                name: orderVas.name,
                arrivalNotice: arrivalNotice
              },
              {
                ...orderVas,
                status: ORDER_VAS_STATUS.READY_TO_PROCESS,
                updater: context.state.user
              }
            )
          })
        )
      }

      /**
       * 5. Update status of arrival notice (ARRIVED => READY_TO_UNLOAD)
       */
      await getRepository(ArrivalNotice).save({
        ...arrivalNotice,
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
