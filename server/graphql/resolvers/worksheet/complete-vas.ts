import { ArrivalNotice, DeliveryOrder, OrderVas, ShippingOrder } from '@things-factory/sales-base'
import { Equal, getManager, getRepository, Not, IsNull } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { ORDER_STATUS, ORDER_TYPES, ORDER_VAS_STATUS, WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../enum'

export const completeVas = {
  async completeVas(_: any, { orderNo, orderType, vasWorksheetDetails }, context: any) {
    return await getManager().transaction(async () => {
      let arrivalNotice: ArrivalNotice
      let deliveryOrder: DeliveryOrder
      // let releaseOfGoods: ReleaseOfGoods
      let shippingOrder: ShippingOrder

      let where: any
      if (orderType === ORDER_TYPES.ARRIVAL_NOTICE) {
        arrivalNotice = await getRepository(ArrivalNotice).findOne({
          where: { domain: context.state.domain, name: orderNo, status: ORDER_STATUS.PROCESSING },
          relations: ['bizplace']
        })

        where = {
          domain: context.state.domain,
          bizplace: arrivalNotice.bizplace,
          status: WORKSHEET_STATUS.EXECUTING,
          type: WORKSHEET_TYPE.VAS,
          arrivalNotice: arrivalNotice
        }
      } else if (orderType === ORDER_TYPES.COLLECTION) {
      } else if (orderType === ORDER_TYPES.DELIVERY) {
      } else if (orderType === ORDER_TYPES.RELEASE_OF_GOODS) {
      } else if (orderType === ORDER_TYPES.SHIPPING) {
      }

      /**
       * 1. Validation for worksheet
       *    - data existing
       */
      const foundVasWorksheet: Worksheet = await getRepository(Worksheet).findOne({
        where,
        relations: [
          'bizplace',
          'arrivalNotice',
          'shippingOrder',
          'worksheetDetails',
          'worksheetDetails.targetProduct',
          'worksheetDetails.targetProduct.product',
          'worksheetDetails.targetVas',
          'worksheetDetails.targetVas.vas'
        ]
      })

      if (!foundVasWorksheet) throw new Error(`Worksheet doesn't exists.`)

      /**
       * 2. Update worksheet detail and order vas
       *    - worksheet detail: Update remark(issue) if it's exists
       *    - order vas: Update status
       */
      await Promise.all(
        vasWorksheetDetails.map(async (worksheetDetail: WorksheetDetail) => {
          await getRepository(WorksheetDetail).update(
            {
              domain: context.state.domain,
              name: worksheetDetail.name,
              bizplace: foundVasWorksheet.bizplace
            },
            {
              issue: worksheetDetail.issue,
              updater: context.state.user
            }
          )

          await getRepository(OrderVas).update(
            {
              domain: context.state.domain,
              name: worksheetDetail.targetVas.name,
              arrivalNotice: arrivalNotice ? arrivalNotice : IsNull(),
              deliveryOrder: deliveryOrder ? deliveryOrder : IsNull(),
              shippingOrder: shippingOrder ? shippingOrder : IsNull()
            },
            {
              status: worksheetDetail.issue ? ORDER_VAS_STATUS.UNCOMPLETED : ORDER_VAS_STATUS.COMPLETED,
              updater: context.state.user
            }
          )
        })
      )

      /**
       * 3. Update worksheet status (status: EXECUTING => DONE)
       */
      await getRepository(Worksheet).save({
        ...foundVasWorksheet,
        status: WORKSHEET_STATUS.DONE,
        endedAt: Date.now(),
        updater: context.state.user
      })

      /**
       * 4. Check whether every related worksheet is completed
       *    - if yes => Update Status of parent order
       */
      const relatedWorksheets: Worksheet[] = await getRepository(Worksheet).find({
        where: {
          domain: context.state.domain,
          bizplace: foundVasWorksheet.bizplace,
          status: Not(Equal(WORKSHEET_STATUS.DONE)),
          arrivalNotice: arrivalNotice ? arrivalNotice : IsNull(),
          shippingOrder: shippingOrder ? shippingOrder : IsNull()
        }
      })

      if (!relatedWorksheets || relatedWorksheets.length === 0) {
        if (orderType === ORDER_TYPES.ARRIVAL_NOTICE) {
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
        } else if (orderType === ORDER_TYPES.COLLECTION) {
        } else if (orderType === ORDER_TYPES.DELIVERY) {
        } else if (orderType === ORDER_TYPES.RELEASE_OF_GOODS) {
        } else if (orderType === ORDER_TYPES.SHIPPING) {
        }
      }

      return foundVasWorksheet
    })
  }
}
