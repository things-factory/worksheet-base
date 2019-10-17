import { ArrivalNotice, ReleaseGood, ORDER_STATUS, ORDER_TYPES, VasOrder } from '@things-factory/sales-base'
import { Equal, getManager, Not } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet } from '../../../entities'

export const completeVas = {
  async completeVas(_: any, { orderNo, orderType }, context: any) {
    return await getManager().transaction(async trxMgr => {
      if (orderType === ORDER_TYPES.ARRIVAL_NOTICE) {
        const arrivalNotice: ArrivalNotice = await trxMgr.getRepository(ArrivalNotice).findOne({
          where: { domain: context.state.domain, name: orderNo },
          relations: ['bizplace']
        })

        if (!arrivalNotice) throw new Error(`Arrival notice dosen't exist.`)

        const worksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
          where: {
            arrivalNotice,
            domain: context.state.domain,
            type: WORKSHEET_TYPE.VAS,
            status: WORKSHEET_STATUS.EXECUTING
          }
        })

        if (!worksheet) throw new Error(`Worksheet doesn't exist`)

        await trxMgr.getRepository(Worksheet).save({
          ...worksheet,
          status: WORKSHEET_STATUS.DONE,
          endedAt: new Date(),
          updater: context.state.user
        })

        // 2. If there's no more worksheet related with current arrival notice
        // update status of work sheet
        // 2. 1) check wheter there are more worksheet or not
        const relatedWorksheets: Worksheet[] = await trxMgr.getRepository(Worksheet).find({
          domain: context.state.domain,
          arrivalNotice,
          status: Not(Equal(WORKSHEET_STATUS.DONE))
        })

        if (!relatedWorksheets || (relatedWorksheets && relatedWorksheets.length === 0)) {
          // 3. update status of arrival notice
          await trxMgr.getRepository(ArrivalNotice).save({
            ...arrivalNotice,
            status: ORDER_STATUS.DONE,
            updater: context.state.user
          })
        }
      } else if (orderType === ORDER_TYPES.RELEASE_OF_GOODS) {
        const releaseGood: ReleaseGood = await trxMgr.getRepository(ReleaseGood).findOne({
          where: { domain: context.state.domain, name: orderNo },
          relations: ['bizplace']
        })

        if (!releaseGood) throw new Error(`Release order dosen't exist.`)

        const worksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
          where: {
            releaseGood,
            domain: context.state.domain,
            type: WORKSHEET_TYPE.VAS,
            status: WORKSHEET_STATUS.EXECUTING
          }
        })

        if (!worksheet) throw new Error(`Worksheet doesn't exist`)

        await trxMgr.getRepository(Worksheet).save({
          ...worksheet,
          status: WORKSHEET_STATUS.DONE,
          endedAt: new Date(),
          updater: context.state.user
        })

        // 2. If there's no more worksheet related with current release good
        // update status of work sheet
        // 2. 1) check wheter there are more worksheet or not
        const relatedWorksheets: Worksheet[] = await trxMgr.getRepository(Worksheet).find({
          domain: context.state.domain,
          releaseGood,
          status: Not(Equal(WORKSHEET_STATUS.DONE))
        })

        if (!relatedWorksheets || (relatedWorksheets && relatedWorksheets.length === 0)) {
          // 3. update status of release good
          await trxMgr.getRepository(ReleaseGood).save({
            ...releaseGood,
            status: ORDER_STATUS.DONE,
            updater: context.state.user
          })
        }
      } else if (orderType === ORDER_TYPES.VAS_ORDER) {
        const vasOrder: VasOrder = await trxMgr.getRepository(VasOrder).findOne({
          where: { domain: context.state.domain, name: orderNo },
          relations: ['bizplace']
        })

        if (!vasOrder) throw new Error(`VAS order dosen't exist.`)

        const worksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
          where: {
            vasOrder,
            domain: context.state.domain,
            type: WORKSHEET_TYPE.VAS,
            status: WORKSHEET_STATUS.EXECUTING
          }
        })

        if (!worksheet) throw new Error(`Worksheet doesn't exist`)

        // Update status of worksheet
        await trxMgr.getRepository(Worksheet).save({
          ...worksheet,
          status: WORKSHEET_STATUS.DONE,
          endedAt: new Date(),
          updater: context.state.user
        })

        // Update order status
        await trxMgr.getRepository(VasOrder).save({
          ...vasOrder,
          status: ORDER_STATUS.DONE,
          updater: context.state.user
        })
      }
    })
  }
}
