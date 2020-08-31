import { Role } from '@things-factory/auth-base'
import { ArrivalNotice, OrderProduct, ORDER_PRODUCT_STATUS, ORDER_STATUS } from '@things-factory/sales-base'
import { sendNotification } from '@things-factory/shell'
import { getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../../constants'
import { Worksheet } from '../../../../entities'

export const completePreunloadResolver = {
  async completePreunload(_: any, { arrivalNoticeNo }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const foundGAN: ArrivalNotice = await trxMgr.getRepository(ArrivalNotice).findOne({
        where: {
          domain: context.state.domain,
          name: arrivalNoticeNo,
          status: ORDER_STATUS.READY_TO_UNLOAD
        },
        relations: ['bizplace']
      })

      if (!foundGAN) throw new Error(`Arrival Notice doesn't exists.`)

      let foundOPs: OrderProduct[] = await trxMgr.getRepository(OrderProduct).find({
        where: {
          domain: context.state.domain,
          arrivalNotice: foundGAN
        }
      })

      if (foundOPs.some(op => op.status === ORDER_PRODUCT_STATUS.INSPECTED)) {
        foundOPs = foundOPs.map((op: OrderProduct) => {
          if (op?.adjustedPalletQty) {
            return {
              ...op,
              palletQty: op.adjustedPalletQty,
              status: op.status === ORDER_PRODUCT_STATUS.INSPECTED ? ORDER_PRODUCT_STATUS.READY_TO_UNLOAD : op.status,
              updater: context.state.user
            }
          }
        })
        await trxMgr.getRepository(OrderProduct).save(foundOPs)
      }

      const foundWS: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
        where: {
          domain: context.state.domain,
          arrivalNotice: foundGAN,
          status: WORKSHEET_STATUS.DEACTIVATED,
          type: WORKSHEET_TYPE.UNLOADING
        }
      })

      // notification logics
      // get Office Admin Users
      const users: any[] = await trxMgr
        .getRepository('users_roles')
        .createQueryBuilder('ur')
        .select('ur.users_id', 'id')
        .where(qb => {
          const subQuery = qb
            .subQuery()
            .select('role.id')
            .from(Role, 'role')
            .where("role.name = 'Office Admin'")
            .andWhere('role.domain_id = :domain', { domain: context.state.domain.id })
            .getQuery()
          return 'ur.roles_id IN ' + subQuery
        })
        .getRawMany()

      // send notification to Office Admin Users
      if (users?.length) {
        const msg = {
          title: `Pending Adjustment for ${foundGAN.name}`,
          message: `Pending process for batch id adjustments`,
          url: context.header.referer
        }
        users.forEach(user => {
          sendNotification({
            receiver: user.id,
            message: JSON.stringify(msg)
          })
        })
      }

      /**
       * 5. Update Worksheet (status: DEACTIVATED => PENDING_ADJUSTMENT)
       */
      await trxMgr.getRepository(Worksheet).save({
        ...foundWS,
        status: WORKSHEET_STATUS.PENDING_ADJUSTMENT,
        updater: context.state.user
      })

      return
    })
  }
}
