import { ArrivalNotice, OrderVas } from '@things-factory/sales-base'
import { getRepository } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { ORDER_TYPES, WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../enum'

export const vasWorksheetResolver = {
  async vasWorksheet(_: any, { orderName, orderType }, context: any) {
    // 1. If it's worksheet which is related with arrival notice
    if (orderType === ORDER_TYPES.ARRIVAL_NOTICE) {
      const arrivalNotice: ArrivalNotice = await getRepository(ArrivalNotice).findOne({
        where: { domain: context.state.domain, name: orderName },
        relations: ['bizplace`']
      })

      const worksheet: Worksheet = await getRepository(Worksheet).findOne({
        where: {
          domain: context.state.domain,
          arrivalNotice,
          bizplace: arrivalNotice.bizplace,
          type: WORKSHEET_TYPE.VAS,
          status: WORKSHEET_STATUS.EXECUTING
        },
        relations: [
          'domain',
          'bizplace',
          'arrivalNotice',
          'worksheetDetails',
          'worksheetDetails.fromLocation',
          'worksheetDetails.targetVas',
          'worksheetDetails.targetVas.vas',
          'creator',
          'updater'
        ]
      })

      return {
        worksheetInfo: {
          bizplaceName: worksheet.bizplace.name,
          containerNo: worksheet.bizplace.containerNo,
          bufferLocation: worksheet.worksheetDetails[0].toLocation.name,
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
            remark: targetVas.remark
          }
        })
      }
    } else if (orderType === ORDER_TYPES.COLLECTION) {
    } else if (orderType === ORDER_TYPES.DELIVERY) {
    } else if (orderType === ORDER_TYPES.RELEASE_OF_GOODS) {
    } else if (orderType === ORDER_TYPES.SHIPPING) {
    }
  }
}
