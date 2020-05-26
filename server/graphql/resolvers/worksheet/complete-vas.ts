import { User } from '@things-factory/auth-base'
import {
  ArrivalNotice,
  OrderVas,
  ORDER_STATUS,
  ORDER_TYPES,
  ORDER_VAS_STATUS,
  ReleaseGood,
  VasOrder
} from '@things-factory/sales-base'
import { EntityManager, Equal, getManager, Not } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { completeRepackaging, completeRepalletizing, completeRelabeling } from './vas-transactions'

type CompleteTransactionType = (trxMgr: EntityManager, orderVas: OrderVas, user: User) => Promise<void>

const COMPLETE_TRX_MAP: { [key: string]: CompleteTransactionType } = {
  'vas-repalletizing': completeRepalletizing,
  'vas-repack': completeRepackaging,
  'vas-relabel': completeRelabeling
}

export const completeVas = {
  async completeVas(_: any, { orderNo, orderType }, context: any) {
    return await getManager().transaction(async (trxMgr: EntityManager) => {
      let orderCondition: any = {}
      switch (orderType) {
        case ORDER_TYPES.ARRIVAL_NOTICE:
          const arrivalNotice: ArrivalNotice = await trxMgr.getRepository(ArrivalNotice).findOne({
            where: { domain: context.state.domain, name: orderNo },
            relations: ['bizplace']
          })

          if (!arrivalNotice) throw new Error(`Arrival notice dosen't exist.`)
          orderCondition = { ...orderCondition, arrivalNotice }
          break

        case ORDER_TYPES.RELEASE_OF_GOODS:
          const releaseGood: ReleaseGood = await trxMgr.getRepository(ReleaseGood).findOne({
            where: { domain: context.state.domain, name: orderNo },
            relations: ['bizplace']
          })

          if (!releaseGood) throw new Error(`Release order dosen't exist.`)
          orderCondition = { ...orderCondition, releaseGood }
          break

        case ORDER_TYPES.VAS_ORDER:
          const vasOrder: VasOrder = await trxMgr.getRepository(VasOrder).findOne({
            where: { domain: context.state.domain, name: orderNo },
            relations: ['bizplace']
          })

          if (!vasOrder) throw new Error(`VAS order dosen't exist.`)
          orderCondition = { ...orderCondition, vasOrder }
          break

        default:
          throw new Error(`Order type is not proper.`)
      }

      const worksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
        where: {
          ...orderCondition,
          domain: context.state.domain,
          type: WORKSHEET_TYPE.VAS,
          status: WORKSHEET_STATUS.EXECUTING
        },
        relations: ['worksheetDetails', 'worksheetDetails.targetVas', 'worksheetDetails.targetVas.vas']
      })

      if (!worksheet) throw new Error(`Worksheet doesn't exist`)

      await trxMgr.getRepository(Worksheet).save({
        ...worksheet,
        status: WORKSHEET_STATUS.DONE,
        endedAt: new Date(),
        updater: context.state.user
      })

      const worksheetDetails: WorksheetDetail[] = worksheet.worksheetDetails.map((worksheetDetail: WorksheetDetail) => {
        return {
          ...worksheetDetail,
          status: WORKSHEET_STATUS.DONE,
          updater: context.state.user
        }
      })
      await trxMgr.getRepository(WorksheetDetail).save(worksheetDetails)

      let orderVass: OrderVas[] = worksheetDetails.map((worksheetDetail: WorksheetDetail) => worksheetDetail.targetVas)
      orderVass = orderVass.map((orderVas: OrderVas) => {
        return {
          ...orderVas,
          status: ORDER_VAS_STATUS.TERMINATED
        }
      })

      for (const orderVas of orderVass) {
        if (orderVas?.operationGuide) {
          await doOperationTransaction(trxMgr, orderVas, context.state.user)
        }
      }

      // 2. If there's no more worksheet related with current arrival notice
      // update status of work sheet
      // 2. 1) check wheter there are more worksheet or not
      const relatedWorksheets: Worksheet[] = await trxMgr.getRepository(Worksheet).find({
        domain: context.state.domain,
        ...orderCondition,
        status: Not(Equal(WORKSHEET_STATUS.DONE))
      })

      if (!relatedWorksheets || (relatedWorksheets && relatedWorksheets.length === 0)) {
        switch (orderType) {
          case ORDER_TYPES.ARRIVAL_NOTICE:
            await trxMgr.getRepository(ArrivalNotice).save({
              ...orderCondition.arrivalNotice,
              status: ORDER_STATUS.DONE,
              updater: context.state.user
            })
            break

          case ORDER_TYPES.RELEASE_OF_GOODS:
            await trxMgr.getRepository(ReleaseGood).save({
              ...orderCondition.releaseGood,
              status: ORDER_STATUS.DONE,
              updater: context.state.user
            })
            break

          case ORDER_TYPES.VAS_ORDER:
            await trxMgr.getRepository(VasOrder).save({
              ...orderCondition.vasOrder,
              status: ORDER_STATUS.DONE,
              updater: context.state.user
            })
            break
        }
      }
    })
  }
}

async function doOperationTransaction(trxMgr: EntityManager, orderVas: OrderVas, user: User) {
  const operationGuide: string = orderVas?.vas?.operationGuide
  if (operationGuide) {
    await COMPLETE_TRX_MAP[operationGuide](trxMgr, orderVas, user)
  }
}
