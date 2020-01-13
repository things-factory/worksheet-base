import { Bizplace } from '@things-factory/biz-base'
import { OrderInventory, ORDER_INVENTORY_STATUS, ORDER_STATUS, ReleaseGood } from '@things-factory/sales-base'
import { sendNotification } from '@things-factory/shell'
import { getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const completeReturn = {
  async completeReturn(_: any, { releaseGoodNo }, context: any) {
    return await getManager().transaction(async trxMgr => {
      /**
       * 1. Validation for worksheet
       *    - data existing
       */
      const releaseGood: ReleaseGood = await trxMgr.getRepository(ReleaseGood).findOne({
        where: { domain: context.state.domain, name: releaseGoodNo, status: ORDER_STATUS.PARTIAL_RETURN },
        relations: ['bizplace']
      })

      if (!releaseGood) throw new Error(`Release order doesn't exists.`)
      const customerBizplace: Bizplace = releaseGood.bizplace

      const foundReturnWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
        where: {
          domain: context.state.domain,
          bizplace: customerBizplace,
          status: WORKSHEET_STATUS.EXECUTING,
          type: WORKSHEET_TYPE.RETURN,
          releaseGood
        },
        relations: ['worksheetDetails', 'worksheetDetails.targetInventory']
      })

      if (!foundReturnWorksheet) throw new Error(`Worksheet doesn't exists.`)

      await trxMgr.getRepository(Worksheet).save({
        ...foundReturnWorksheet,
        status: WORKSHEET_STATUS.DONE,
        endedAt: new Date(),
        updater: context.state.user
      })

      const worksheetDetails: WorksheetDetail[] = foundReturnWorksheet.worksheetDetails.map(
        (worksheetDetail: WorksheetDetail) => {
          return {
            ...worksheetDetail,
            status: WORKSHEET_STATUS.DONE,
            updater: context.state.user
          }
        }
      )
      await trxMgr.getRepository(WorksheetDetail).save(worksheetDetails)

      let targetInventories: OrderInventory[] = worksheetDetails.map(
        (worksheetDetail: WorksheetDetail) => worksheetDetail.targetInventory
      )
      targetInventories = targetInventories.map((orderInventory: OrderInventory) => {
        return {
          ...orderInventory,
          status: ORDER_INVENTORY_STATUS.TERMINATED,
          updater: context.state.user
        }
      })

      // notification logics
      // get Customer Users
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

      // send notification to Customer Users
      if (users?.length) {
        const msg = {
          title: `Stock has been returned to storage`,
          message: `${releaseGoodNo} is done`,
          url: context.header.referer
        }
        users.forEach(user => {
          sendNotification({
            receiver: user.id,
            message: JSON.stringify(msg)
          })
        })
      }

      // 3. update status of arrival notice
      await trxMgr.getRepository(ReleaseGood).save({
        ...releaseGood,
        status: ORDER_STATUS.DONE,
        updater: context.state.user
      })
    })
  }
}
