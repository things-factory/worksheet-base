import { Bizplace } from '@things-factory/biz-base'
import { ArrivalNotice, OrderVas, ReleaseGood, ORDER_STATUS, ORDER_TYPES, VasOrder } from '@things-factory/sales-base'
import { getRepository, Equal, Not } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const vasWorksheetResolver = {
  async vasWorksheet(_: any, { orderNo, orderType }, context: any) {
    // 1. If it's worksheet which is related with arrival notice
    if (orderType === ORDER_TYPES.ARRIVAL_NOTICE) {
      const arrivalNotice: ArrivalNotice = await getRepository(ArrivalNotice).findOne({
        where: { domain: context.state.domain, name: orderNo, status: Not(Equal(ORDER_STATUS.DONE)) },
        relations: ['bizplace']
      })

      if (!arrivalNotice) throw new Error(`Arrival notice dosen't exist.`)
      const customerBizplace: Bizplace = arrivalNotice.bizplace

      const worksheet: Worksheet = await getRepository(Worksheet).findOne({
        where: {
          arrivalNotice,
          domain: context.state.domain,
          type: WORKSHEET_TYPE.VAS,
          status: WORKSHEET_STATUS.EXECUTING
        },
        relations: [
          'arrivalNotice',
          'worksheetDetails',
          'worksheetDetails.targetVas',
          'worksheetDetails.targetVas.vas',
          'creator',
          'updater'
        ]
      })

      return {
        worksheetInfo: {
          bizplaceName: customerBizplace.name,
          containerNo: arrivalNotice.containerNo,
          startedAt: worksheet.startedAt
        },
        worksheetDetailInfos: worksheet.worksheetDetails.map((vasWSD: WorksheetDetail) => {
          const targetVas: OrderVas = vasWSD.targetVas
          return {
            name: vasWSD.name,
            batchId: targetVas.batchId,
            targetName: targetVas.name,
            vas: targetVas.vas,
            description: vasWSD.description,
            remark: targetVas.remark,
            status: vasWSD.status
          }
        })
      }
    } else if (orderType === ORDER_TYPES.RELEASE_OF_GOODS) {
      const releaseGood: ReleaseGood = await getRepository(ReleaseGood).findOne({
        where: { domain: context.state.domain, name: orderNo, status: Not(Equal(ORDER_STATUS.DONE)) },
        relations: ['bizplace']
      })

      if (!releaseGood) throw new Error(`Release order dosen't exist.`)
      const customerBizplace: Bizplace = releaseGood.bizplace

      const worksheet: Worksheet = await getRepository(Worksheet).findOne({
        where: {
          releaseGood,
          domain: context.state.domain,
          type: WORKSHEET_TYPE.VAS,
          status: WORKSHEET_STATUS.EXECUTING
        },
        relations: [
          'releaseGood',
          'worksheetDetails',
          'worksheetDetails.targetVas',
          'worksheetDetails.targetVas.vas',
          'creator',
          'updater'
        ]
      })

      return {
        worksheetInfo: {
          bizplaceName: customerBizplace.name,
          startedAt: worksheet.startedAt
        },
        worksheetDetailInfos: worksheet.worksheetDetails.map((vasWSD: WorksheetDetail) => {
          const targetVas: OrderVas = vasWSD.targetVas
          return {
            name: vasWSD.name,
            batchId: targetVas.batchId,
            targetName: targetVas.name,
            vas: targetVas.vas,
            description: vasWSD.description,
            remark: targetVas.remark,
            status: vasWSD.status
          }
        })
      }
    } else if (orderType === ORDER_TYPES.VAS_ORDER) {
      const vasOrder: VasOrder = await getRepository(VasOrder).findOne({
        where: { domain: context.state.domain, name: orderNo, status: Not(Equal(ORDER_STATUS.DONE)) },
        relations: ['bizplace']
      })

      if (!vasOrder) throw new Error(`Vas order dosen't exist.`)
      const customerBizplace: Bizplace = vasOrder.bizplace

      const worksheet: Worksheet = await getRepository(Worksheet).findOne({
        where: {
          vasOrder,
          domain: context.state.domain,
          type: WORKSHEET_TYPE.VAS,
          status: WORKSHEET_STATUS.EXECUTING
        },
        relations: [
          'vasOrder',
          'worksheetDetails',
          'worksheetDetails.targetVas',
          'worksheetDetails.targetVas.vas',
          'creator',
          'updater'
        ]
      })

      return {
        worksheetInfo: {
          bizplaceName: customerBizplace.name,
          startedAt: worksheet.startedAt
        },
        worksheetDetailInfos: worksheet.worksheetDetails.map((vasWSD: WorksheetDetail) => {
          const targetVas: OrderVas = vasWSD.targetVas
          return {
            name: vasWSD.name,
            batchId: targetVas.batchId,
            targetName: targetVas.name,
            vas: targetVas.vas,
            description: vasWSD.description,
            remark: targetVas.remark,
            status: vasWSD.status
          }
        })
      }
    }
  }
}
