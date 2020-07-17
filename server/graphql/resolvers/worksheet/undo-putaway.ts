import { ArrivalNotice, OrderInventory, ORDER_PRODUCT_STATUS, ORDER_TYPES } from '@things-factory/sales-base'
import {
  Inventory,
  INVENTORY_STATUS,
  INVENTORY_TRANSACTION_TYPE,
  Location,
  LOCATION_STATUS
} from '@things-factory/warehouse-base'
import { getManager } from 'typeorm'
import { WORKSHEET_STATUS } from '../../../constants'
import { WorksheetDetail } from '../../../entities'
import { generateInventoryHistory } from '../../../utils'

export const undoPutaway = {
  async undoPutaway(_: any, { worksheetDetailName, palletId }, context: any) {
    return await getManager().transaction(async trxMgr => {
      // 1. update status of worksheetDetail (DONE => EXECUTING)
      const foundWorksheetDetail: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
        where: { domain: context.state.domain, name: worksheetDetailName, status: WORKSHEET_STATUS.DONE },
        relations: [
          'worksheet',
          'worksheet.arrivalNotice',
          'bizplace',
          'fromLocation',
          'toLocation',
          'targetInventory',
          'targetInventory.inventory'
        ]
      })

      if (!foundWorksheetDetail) throw new Error("Worksheet doesn't exists")
      const arrivalNotice: ArrivalNotice = foundWorksheetDetail.worksheet.arrivalNotice
      const targetInventory: OrderInventory = foundWorksheetDetail.targetInventory
      const foundInv: Inventory = targetInventory.inventory

      const foundOIs: OrderInventory[] = await trxMgr.getRepository(OrderInventory).find({
        where: {
          domain: context.state.domain,
          type: ORDER_TYPES.RELEASE_OF_GOODS,
          inventory: foundInv
        },
        relations: ['domain']
      })

      if (foundOIs?.length) throw new Error('This Pallet ID has been selected for releasing')
      await trxMgr.getRepository(OrderInventory).save({
        ...targetInventory,
        status: ORDER_PRODUCT_STATUS.PUTTING_AWAY,
        updater: context.state.user
      })

      await trxMgr.getRepository(WorksheetDetail).save({
        ...foundWorksheetDetail,
        status: WORKSHEET_STATUS.EXECUTING
      })

      // 2. update inventory from shelf location to buffer location
      const foundInventory: Inventory = await trxMgr.getRepository(Inventory).findOne({
        where: { domain: context.state.domain, palletId },
        relations: ['location']
      })

      // 3. update status of location
      // 3. 1) if there's no inventories related with location => EMPTY
      const shelfLocation: Location = foundInventory.location
      const relatedInventory: Inventory = await trxMgr.getRepository(Inventory).findOne({
        where: { domain: context.state.domain, location: shelfLocation }
      })
      if (!relatedInventory) {
        await trxMgr.getRepository(Location).save({
          ...shelfLocation,
          status: LOCATION_STATUS.EMPTY
        })
      }

      // Update (Revert back) status and location of inventory
      const inventory: Inventory = await trxMgr.getRepository(Inventory).save({
        ...foundInventory,
        location: await trxMgr.getRepository(Location).findOne({
          where: { domain: context.state.domain, name: foundWorksheetDetail.fromLocation.name }
        }),
        status: INVENTORY_STATUS.UNLOADED,
        updater: context.state.user
      })

      // Generate inventory history
      await generateInventoryHistory(
        inventory,
        arrivalNotice,
        INVENTORY_TRANSACTION_TYPE.UNDO_PUTAWAY,
        0,
        0,
        context.state.user,
        trxMgr
      )
    })
  }
}
