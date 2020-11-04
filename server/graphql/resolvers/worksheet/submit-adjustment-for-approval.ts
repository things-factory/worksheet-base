import { Bizplace } from '@things-factory/biz-base'
import { sendNotification } from '@things-factory/shell'
import { getManager } from 'typeorm'
import { ArrivalNotice, ORDER_STATUS } from '@things-factory/sales-base'
import { Worksheet } from '../../../entities'
import { WORKSHEET_TYPE } from '../../../constants'

export const submitAdjustmentForApprovalResolver = {
  async submitAdjustmentForApproval(_: any, { name }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const foundArrivalNotice: ArrivalNotice = await trxMgr.getRepository(ArrivalNotice).findOne({
        where: { domain: context.state.domain, name, status: ORDER_STATUS.READY_TO_UNLOAD },
        relations: [
          'bizplace',
          'orderProducts',
          'orderProducts.product',
          'orderVass',
          'orderVass.vas',
          'creator',
          'updater'
        ]
      })

      if (!foundArrivalNotice) throw new Error(`Arrival notice doesn't exists.`)
      let customerBizplace: Bizplace = foundArrivalNotice.bizplace

      const foundWS: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
        where: {
          domain: context.state.domain,
          arrivalNotice: foundArrivalNotice,
          type: WORKSHEET_TYPE.UNLOADING,
          bizplace: customerBizplace
        }
      })
      if (!foundWS) throw new Error(`Worksheet doesn't exists.`)

      // 1. GAN Status change (READY_TO_UNLOAD => PENDING_APPROVAL)
      await trxMgr.getRepository(ArrivalNotice).save({
        ...foundArrivalNotice,
        status: ORDER_STATUS.PENDING_APPROVAL,
        updater: context.state.user
      })

      // 1. Worksheet Status change (PENDING_ADJUSTMENT => PENDING_APPROVAL)
      await trxMgr.getRepository(Worksheet).save({
        ...foundWS,
        status: ORDER_STATUS.PENDING_APPROVAL,
        updater: context.state.user
      })

      // notification logics
      // get Customer by bizplace
      const users: any[] = await trxMgr
        .getRepository('bizplaces_users')
        .createQueryBuilder('bu')
        .select('bu.user_id', 'id')
        .where(qb => {
          const subQuery = qb
            .subQuery()
            .select('bizplace.id')
            .from(Bizplace, 'bizplace')
            .where('bizplace.name = :bizplaceName', { bizplaceName: customerBizplace.name })
            .getQuery()
          return 'bu.bizplace_id IN ' + subQuery
        })
        .getRawMany()

      // send notification to Office Admin Users
      if (users?.length) {
        const msg = {
          title: `Adjustment in Batch No`,
          message: `There are batch no adjustment awaiting for your approval`,
          url: context.header.referer
        }
        users.forEach(user => {
          sendNotification({
            receiver: user.id,
            message: JSON.stringify(msg)
          })
        })
      }
    })
  }
}
