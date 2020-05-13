import { Bizplace } from '@things-factory/biz-base'
import { ArrivalNotice, OrderVas, ORDER_STATUS, ORDER_TYPES, ReleaseGood, VasOrder } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Location } from '@things-factory/warehouse-base'
import { Equal, getRepository, Not } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const vasWorksheetResolver = {
  async vasWorksheet(_: any, { orderNo, orderType }, context: any) {
    // 1. If it's worksheet which is related with arrival notice
    let commonRelations: string[] = [
      'worksheetDetails',
      'worksheetDetails.targetVas',
      'worksheetDetails.targetVas.vas',
      'worksheetDetails.targetVas.inventory',
      'worksheetDetails.targetVas.targetProduct',
      'worksheetDetails.targetVas.inventory.location',
      'creator',
      'updater'
    ]

    let refOrder: ArrivalNotice | ReleaseGood | VasOrder = null
    let worksheetCondition: {
      ['arrivalNotice']?: ArrivalNotice
      ['releaseGood']?: ReleaseGood
      ['vasOrder']?: VasOrder
      domain: Domain
      type: String
      status: String
    } = {
      domain: context.state.domain,
      type: WORKSHEET_TYPE.VAS,
      status: WORKSHEET_STATUS.EXECUTING
    }

    if (orderType === ORDER_TYPES.ARRIVAL_NOTICE) {
      refOrder = await getRepository(ArrivalNotice).findOne({
        where: { domain: context.state.domain, name: orderNo, status: Not(Equal(ORDER_STATUS.DONE)) },
        relations: ['bizplace']
      })

      if (!refOrder) throw new Error(`Arrival notice doesn't exsits`)
      worksheetCondition.arrivalNotice = refOrder
    } else if (orderType === ORDER_TYPES.RELEASE_OF_GOODS) {
      refOrder = await getRepository(ReleaseGood).findOne({
        where: { domain: context.state.domain, name: orderNo, status: Not(Equal(ORDER_STATUS.DONE)) },
        relations: ['bizplace']
      })

      if (!refOrder) throw new Error(`Release goods doesn't exsits`)
      worksheetCondition.releaseGood = refOrder
    } else if (orderType === ORDER_TYPES.VAS_ORDER) {
      refOrder = await getRepository(VasOrder).findOne({
        where: { domain: context.state.domain, name: orderNo, status: Not(Equal(ORDER_STATUS.DONE)) },
        relations: ['bizplace']
      })

      if (!refOrder) throw new Error(`VAS order doesn't exsists`)
      worksheetCondition.vasOrder = refOrder
    }

    const worksheet: Worksheet = await getRepository(Worksheet).findOne({
      where: worksheetCondition,
      relations: commonRelations
    })

    return {
      worksheetInfo: {
        bizplaceName: refOrder.bizplace.name,
        containerNo: refOrder?.containerNo,
        startedAt: worksheet.startedAt
      },
      worksheetDetailInfos: worksheet.worksheetDetails.map((wsd: WorksheetDetail) => {
        const targetVas: OrderVas = wsd.targetVas
        return {
          name: wsd.name,
          batchId: targetVas.batchId,
          targetName: targetVas.name,
          vas: targetVas.vas,
          set: targetVas?.set,
          inventory: targetVas?.inventory,
          locationInv: targetVas?.inventory?.location?.name,
          targetType: targetVas?.targetType,
          targetBatchId: targetVas?.targetBatchId,
          targetProduct: targetVas?.targetProduct,
          otherTarget: targetVas?.otherTarget,
          qty: targetVas?.qty,
          weight: targetVas?.weight,
          operationGuide: targetVas.operationGuide,
          description: wsd.description,
          remark: targetVas.remark,
          status: wsd.status,
          issue: wsd.issue
        }
      })
    }
  }
}
