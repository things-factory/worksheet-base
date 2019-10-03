import { Bizplace } from '@things-factory/biz-base'
import { ArrivalNotice, ORDER_STATUS } from '@things-factory/sales-base'
import { Equal, getManager, getRepository, Not } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet } from '../../../entities'

export const completePutaway = {
  async completePutaway(_: any, { arrivalNoticeNo }, context: any) {
    return await getManager().transaction(async () => {
      /**
       * 1. Validation for worksheet
       *    - data existing
       */
      const arrivalNotice: ArrivalNotice = await getRepository(ArrivalNotice).findOne({
        where: { domain: context.state.domain, name: arrivalNoticeNo, status: ORDER_STATUS.PUTTING_AWAY },
        relations: ['bizplace']
      })

      if (!arrivalNotice) throw new Error(`ArrivalNotice doesn't exists.`)
      const customerBizplace: Bizplace = arrivalNotice.bizplace

      const foundPutawayWorksheet: Worksheet = await getRepository(Worksheet).findOne({
        where: {
          domain: context.state.domain,
          bizplace: customerBizplace,
          status: WORKSHEET_STATUS.EXECUTING,
          type: WORKSHEET_TYPE.PUTAWAY,
          arrivalNotice
        }
      })

      if (!foundPutawayWorksheet) throw new Error(`Worksheet doesn't exists.`)

      await getRepository(Worksheet).save({
        ...foundPutawayWorksheet,
        status: WORKSHEET_STATUS.DONE,
        endedAt: Math.floor(Date.now() / 1000),
        updater: context.state.user
      })

      // 2. If there's no more worksheet related with current arrival notice
      // update status of work sheet
      // 2. 1) check wheter there are more worksheet or not
      const relatedWorksheets: Worksheet[] = await getRepository(Worksheet).find({
        domain: context.state.domain,
        arrivalNotice,
        status: Not(Equal(WORKSHEET_STATUS.DONE))
      })

      if (!relatedWorksheets || (relatedWorksheets && relatedWorksheets.length === 0)) {
        // 3. update status of arrival notice
        await getRepository(ArrivalNotice).save({
          ...arrivalNotice,
          status: ORDER_STATUS.DONE,
          updater: context.state.user
        })
      }
    })
  }
}
