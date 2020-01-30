import { OrderInventory, ORDER_INVENTORY_STATUS } from '@things-factory/sales-base'
import {
  Inventory,
  INVENTORY_STATUS,
  INVENTORY_TRANSACTION_TYPE,
  Location,
  LOCATION_STATUS,
  LOCATION_TYPE
} from '@things-factory/warehouse-base'
import { getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { generateInventoryHistory } from '../../../utils/inventory-history-generator'

export const putaway = {
  async putaway(_: any, { worksheetDetailName, palletId, toLocation }, context: any) {
    return await getManager().transaction(async trxMgr => {
      // 1. get worksheet detail
      const worksheetDetail: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
        where: {
          domain: context.state.domain,
          name: worksheetDetailName,
          status: WORKSHEET_STATUS.EXECUTING,
          type: WORKSHEET_TYPE.PUTAWAY
        },
        relations: ['worksheet', 'worksheet.arrivalNotice', 'targetInventory', 'targetInventory.inventory']
      })
      if (!worksheetDetail) throw new Error(`Worksheet Details doesn't exists`)
      const arrivalNotice = worksheetDetail.worksheet.arrivalNotice
      let targetInventory: OrderInventory = worksheetDetail.targetInventory
      let inventory: Inventory = targetInventory.inventory
      if (inventory.palletId !== palletId) throw new Error('Pallet ID is invalid')

      const worksheet: Worksheet = worksheetDetail.worksheet
      if (!worksheet) throw new Error(`Worksheet doesn't exists`)

      // 3. get to location object
      const location: Location = await trxMgr.getRepository(Location).findOne({
        where: { domain: context.state.domain, name: toLocation, type: LOCATION_TYPE.SHELF },
        relations: ['warehouse']
      })
      if (!location) throw new Error(`Location doesn't exists`)

      // 4. update location of inventory (buffer location => toLocation)
      inventory = await trxMgr.getRepository(Inventory).save({
        ...inventory,
        location,
        status: INVENTORY_STATUS.STORED,
        warehouse: location.warehouse,
        zone: location.warehouse.zone,
        updater: context.state.user
      })

      // 4. 1) Update status of location
      if (location.status === LOCATION_STATUS.EMPTY) {
        await trxMgr.getRepository(Location).save({
          ...location,
          status: LOCATION_STATUS.OCCUPIED,
          updater: context.state.user
        })
      }

      // 5. add inventory history
      await generateInventoryHistory(
        inventory,
        arrivalNotice,
        INVENTORY_TRANSACTION_TYPE.PUTAWAY,
        0,
        0,
        context.state.user,
        trxMgr
      )

      // 6. update status of order inventory
      await trxMgr.getRepository(OrderInventory).save({
        ...targetInventory,
        status: ORDER_INVENTORY_STATUS.TERMINATED,
        updater: context.state.user
      })

      // 7. update status of worksheet details (EXECUTING => DONE)
      await trxMgr.getRepository(WorksheetDetail).save({
        ...worksheetDetail,
        status: WORKSHEET_STATUS.DONE,
        updater: context.state.user
      })
    })
  }
}
