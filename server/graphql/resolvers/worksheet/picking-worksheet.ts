import { OrderInventory, ORDER_STATUS, ReleaseGood } from '@things-factory/sales-base'
import { Inventory } from '@things-factory/warehouse-base'
import { EntityManager, getManager, getRepository } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const pickingWorksheetResolver = {
  async pickingWorksheet(_: any, { releaseGoodNo, sortings }, context: any) {
    return await getManager().transaction(async (trxMgr: EntityManager) => {
      const releaseGood: ReleaseGood = await getRepository(ReleaseGood).findOne({
        where: { domain: context.state.domain, name: releaseGoodNo, status: ORDER_STATUS.PICKING },
        relations: ['bizplace']
      })

      const worksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
        where: {
          domain: context.state.domain,
          releaseGood,
          bizplace: releaseGood.bizplace,
          type: WORKSHEET_TYPE.PICKING,
          status: WORKSHEET_STATUS.EXECUTING
        },
        relations: ['bizplace']
      })

      const order = sortings.reduce((obj: {}, sorting: { name: string; desc: boolean }) => {
        return {
          ...obj,
          [sorting.name]: sorting.desc ? 'DESC' : 'ASC'
        }
      }, {})

      const worksheetDetails: WorksheetDetail[] = await trxMgr.getRepository(WorksheetDetail).find({
        where: { worksheet },
        relations: [
          'targetInventory',
          'targetInventory.inventory',
          'targetInventory.inventory.location',
          'targetInventory.inventory.product'
        ],
        order
      })

      return {
        worksheetInfo: {
          bizplaceName: releaseGood.bizplace.name,
          startedAt: worksheet.startedAt,
          refNo: releaseGood.refNo
        },
        worksheetDetailInfos: worksheetDetails.map(async (pickingWSD: WorksheetDetail) => {
          const targetInventory: OrderInventory = pickingWSD.targetInventory
          const inventory: Inventory = targetInventory.inventory
          return {
            name: pickingWSD.name,
            palletId: inventory.palletId,
            batchId: inventory.batchId,
            product: inventory.product,
            qty: inventory.qty,
            releaseQty: targetInventory.releaseQty,
            status: pickingWSD.status,
            description: pickingWSD.description,
            targetName: targetInventory.name,
            packingType: inventory.packingType,
            location: inventory.location
          }
        })
      }
    })
  }
}
