import { OrderInventory, ORDER_INVENTORY_STATUS } from '@things-factory/sales-base'
import { Inventory } from '@things-factory/warehouse-base'
import { getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { WorksheetDetail } from '../../../entities'

export const picking = {
  async picking(_: any, { worksheetDetailName, palletId, releaseQty }, context: any) {
    return await getManager().transaction(async trxMgr => {
      // 1. get worksheet detail
      const worksheetDetail: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
        where: {
          domain: context.state.domain,
          name: worksheetDetailName,
          status: WORKSHEET_STATUS.EXECUTING,
          type: WORKSHEET_TYPE.PICKING
        },
        relations: ['worksheet', 'worksheet.releaseGood', 'targetInventory', 'targetInventory.inventory']
      })
      if (!worksheetDetail) throw new Error(`Worksheet Details doesn't exists`)
      let targetInventory: OrderInventory = worksheetDetail.targetInventory
      let inventory: Inventory = targetInventory.inventory
      if (inventory.palletId !== palletId) throw new Error('Pallet ID is invalid')

      const leftQty = inventory.qty - releaseQty
      if (leftQty < 0) throw new Error(`Invalid qty, can't exceed limitation`)

      await trxMgr.getRepository(OrderInventory).save({
        ...targetInventory,
        status: ORDER_INVENTORY_STATUS.PICKED,
        updater: context.state.user
      })

      // 6. update status of worksheet details (EXECUTING = > DONE)
      await trxMgr.getRepository(WorksheetDetail).save({
        ...worksheetDetail,
        status: WORKSHEET_STATUS.DONE,
        updater: context.state.user
      })
    })
  }
}
