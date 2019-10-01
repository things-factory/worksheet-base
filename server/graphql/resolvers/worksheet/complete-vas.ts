import { ArrivalNotice, VasOrder, ORDER_TYPES } from '@things-factory/sales-base'
import { getManager, getRepository } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet } from '../../../entities'

export const completeVas = {
  async completeVas(_: any, { orderNo, orderType }, context: any) {
    return await getManager().transaction(async () => {
      if (orderType === ORDER_TYPES.ARRIVAL_NOTICE) {
        const arrivalNotice: ArrivalNotice = await getRepository(ArrivalNotice).findOne({
          where: { domain: context.state.domain, name: orderNo },
          relations: ['bizplace']
        })

        if (!arrivalNotice) throw new Error(`Arrival notice dosen't exist.`)

        const worksheet: Worksheet = await getRepository(Worksheet).findOne({
          where: {
            arrivalNotice,
            domain: context.state.domain,
            type: WORKSHEET_TYPE.VAS,
            status: WORKSHEET_STATUS.EXECUTING
          }
        })

        if (!worksheet) throw new Error(`Worksheet doesn't exist`)

        await getRepository(Worksheet).save({
          ...worksheet,
          status: WORKSHEET_STATUS.DONE,
          endedAt: Date.now(),
          updater: context.state.user
        })
      } else if (orderType === ORDER_TYPES.COLLECTION) {
      } else if (orderType === ORDER_TYPES.DELIVERY) {
      } else if (orderType === ORDER_TYPES.RELEASE_OF_GOODS) {
      } else if (orderType === ORDER_TYPES.SHIPPING) {
      } else if (orderType === ORDER_TYPES.VAS_ORDER) {
        const vasOrder: VasOrder = await getRepository(VasOrder).findOne({
          where: { domain: context.state.domain, name: orderNo },
          relations: ['bizplace']
        })

        if (!vasOrder) throw new Error(`Vas order dosen't exist.`)

        const worksheet: Worksheet = await getRepository(Worksheet).findOne({
          where: {
            vasOrder,
            domain: context.state.domain,
            type: WORKSHEET_TYPE.VAS,
            status: WORKSHEET_STATUS.EXECUTING
          }
        })

        if (!worksheet) throw new Error(`Worksheet doesn't exist`)

        await getRepository(Worksheet).save({
          ...worksheet,
          status: WORKSHEET_STATUS.DONE,
          endedAt: Date.now(),
          updater: context.state.user
        })
      }
    })
  }
}
