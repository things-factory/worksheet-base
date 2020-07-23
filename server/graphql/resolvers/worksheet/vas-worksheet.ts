import {
  ArrivalNotice,
  OrderInventory,
  OrderVas,
  ORDER_STATUS,
  ORDER_TYPES,
  ReleaseGood,
  VasOrder
} from '@things-factory/sales-base'
import { Inventory } from '@things-factory/warehouse-base'
import { Equal, getRepository, Not } from 'typeorm'
import { WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { fetchExecutingWorksheet } from '../../../utils'

export const vasWorksheetResolver = {
  async vasWorksheet(_: any, { orderNo, orderType }, context: any) {
    let refOrder: ArrivalNotice | ReleaseGood | VasOrder
    if (orderType === ORDER_TYPES.ARRIVAL_NOTICE) {
      refOrder = await getRepository(ArrivalNotice).findOne({
        where: { domain: context.state.domain, name: orderNo, status: Not(Equal(ORDER_STATUS.DONE)) },
        relations: ['bizplace']
      })
    } else if (orderType === ORDER_TYPES.RELEASE_OF_GOODS) {
      refOrder = await getRepository(ReleaseGood).findOne({
        where: { domain: context.state.domain, name: orderNo, status: Not(Equal(ORDER_STATUS.DONE)) },
        relations: ['bizplace']
      })
    } else if (orderType === ORDER_TYPES.VAS_ORDER) {
      refOrder = await getRepository(VasOrder).findOne({
        where: { domain: context.state.domain, name: orderNo, status: Not(Equal(ORDER_STATUS.DONE)) },
        relations: ['bizplace']
      })
    }

    if (!refOrder) throw new Error(`Couldn't find VAS worksheet by order no (${orderNo})`)

    const worksheet: Worksheet = await fetchExecutingWorksheet(
      context.state.domain,
      refOrder.bizplace,
      [
        'worksheetDetails',
        'worksheetDetails.targetVas',
        'worksheetDetails.targetVas.vas',
        'worksheetDetails.targetVas.inventory',
        'worksheetDetails.targetVas.targetProduct',
        'worksheetDetails.targetVas.inventory.location',
        'creator',
        'updater'
      ],
      WORKSHEET_TYPE.VAS,
      refOrder
    )

    if (orderType === ORDER_TYPES.RELEASE_OF_GOODS) {
      for (let wsd of worksheet.worksheetDetails) {
        const inventory: Inventory = wsd.targetVas.inventory
        const orderInv: OrderInventory = await getRepository(OrderInventory).findOne({
          where: { domain: context.state.domain, releaseGood: refOrder, inventory }
        })

        wsd.targetInventory = orderInv
      }
    }

    return {
      worksheetInfo: {
        bizplaceName: refOrder.bizplace.name,
        containerNo: refOrder?.containerNo,
        startedAt: worksheet.startedAt
      },
      worksheetDetailInfos: worksheet.worksheetDetails
        .sort((a: WorksheetDetail, b: WorksheetDetail) => a.seq - b.seq)
        .map((wsd: WorksheetDetail) => {
          const targetVas: OrderVas = wsd.targetVas
          return {
            name: wsd.name,
            seq: wsd.seq,
            status: wsd.status,
            issue: wsd.issue,
            relatedOrderInv: wsd.targetInventory,
            batchId: targetVas?.batchId,
            targetName: targetVas?.name,
            vas: targetVas?.vas,
            set: targetVas?.set,
            inventory: targetVas?.inventory,
            locationInv: targetVas?.inventory?.location?.name,
            targetType: targetVas?.targetType,
            targetBatchId: targetVas?.targetBatchId,
            targetProduct: targetVas?.targetProduct,
            otherTarget: targetVas?.otherTarget,
            qty: targetVas?.qty,
            weight: targetVas?.weight,
            operationGuide: targetVas?.operationGuide,
            description: wsd.description,
            remark: targetVas?.remark
          }
        })
    }
  }
}
