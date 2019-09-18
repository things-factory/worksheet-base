import { ArrivalNotice, OrderProduct, OrderVas } from '@things-factory/sales-base'
import { Location } from '@things-factory/warehouse-base'
import { getManager } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { ORDER_PRODUCT_STATUS, ORDER_STATUS, ORDER_VAS_STATUS, WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../enum'
import { WorksheetNoGenerator } from '../../../utils/worksheet-no-generator'

export const generateArrivalNoticeWorksheet = {
  async generateArrivalNoticeWorksheet(_: any, { arrivalNotice, bufferLocation }, context: any) {
    return await getManager().transaction(async transactionalEntityManager => {
      /**
       * 1. Validation for arrival notice
       *    - data existing
       *    - status of arrival notice
       */
      const foundArrivalNotice: ArrivalNotice = await transactionalEntityManager.getRepository(ArrivalNotice).findOne({
        where: { domain: context.state.domain, name: arrivalNotice.name },
        relations: ['orderProducts', 'orderVass']
      })

      if (!foundArrivalNotice) throw new Error(`Arrival notice doesn't exists.`)
      if (foundArrivalNotice.status !== ORDER_STATUS.ARRIVED)
        throw new Error('Status is not suitable for getting ready to unload')

      /**
       * 2. Create worksheet
       */
      const worksheet = await transactionalEntityManager.getRepository(Worksheet).save({
        domain: context.state.domain,
        bizplace: context.state.bizplaces[0],
        name: WorksheetNoGenerator.arrivalNotice(),
        type: WORKSHEET_TYPE.ARRIVAL_NOTICE,
        status: WORKSHEET_STATUS.DEACTIVATED,
        creator: context.state.user,
        updater: context.state.user
      })

      /**
       * 3. Create worksheet details for products
       */
      // 3. 1) Create worksheet detail for products
      const orderProducts: [OrderProduct] = foundArrivalNotice.orderProducts
      await Promise.all(
        orderProducts.map(async (orderProduct: OrderProduct) => {
          await transactionalEntityManager.getRepository(WorksheetDetail).save({
            domain: context.state.domain,
            bizplace: context.state.bizplaces[0],
            worksheet,
            name: WorksheetNoGenerator.arrivalNoticeDetail(),
            toLocation: await transactionalEntityManager.getRepository(Location).findOne(bufferLocation.id),
            targetProduct: orderProduct,
            type: WORKSHEET_TYPE.UNLOADING,
            creator: context.state.user,
            updater: context.state.user
          })

          // 3. 2) Update status of order products (ARRIVED => READY_TO_UNLOAD)
          await transactionalEntityManager.getRepository(OrderProduct).update(
            {
              id: orderProduct.id
            },
            {
              ...orderProduct,
              status: ORDER_PRODUCT_STATUS.READY_TO_UNLOAD,
              updater: context.state.user
            }
          )
        })
      )

      /**
       * 4. Create worksheet detail for vass (if it exists)
       */
      const orderVass: [OrderVas] = foundArrivalNotice.orderVass
      if (orderVass && orderVass.length) {
        // 4. 1) Create worksheet detail for vass
        await Promise.all(
          orderVass.map(async (orderVas: OrderVas) => {
            await transactionalEntityManager.getRepository(WorksheetDetail).save({
              targetVas: orderVas,
              type: WORKSHEET_TYPE.VAS,
              creator: context.state.user,
              updater: context.state.user
            })

            // 4. 2) Update status of order vass (ARRIVED => READY_TO_PROCESS)
            transactionalEntityManager.getRepository(WorksheetDetail).update(
              {
                id: orderVas.id
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
      await transactionalEntityManager.getRepository(ArrivalNotice).save({
        ...foundArrivalNotice,
        status: ORDER_STATUS.READY_TO_UNLOAD
      })

      /**
       * 6. Returning worksheet as a result
       */
      return worksheet
    })
  }
}
