import { OrderInventory, ORDER_PRODUCT_STATUS } from '@things-factory/sales-base'
import { Inventory, INVENTORY_STATUS, Location, LOCATION_STATUS } from '@things-factory/warehouse-base'
import { getManager } from 'typeorm'
import { WORKSHEET_STATUS } from '../../../constants'
import { WorksheetDetail } from '../../../entities'

export const undoPutaway = {
  async undoPutaway(_: any, { worksheetDetail, inventory }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const worksheetDetailName = worksheetDetail.name
      const palletId = inventory.palletId

      // 1. update status of worksheetDetail (DONE => EXECUTING)
      const foundWorksheetDetail: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
        where: { domain: context.state.domain, name: worksheetDetailName, status: WORKSHEET_STATUS.DONE },
        relations: ['bizplace', 'fromLocation', 'toLocation', 'targetInventory']
      })

      if (!foundWorksheetDetail) throw new Error("Worksheet doesn't exists")
      const targetInventory: OrderInventory = foundWorksheetDetail.targetInventory
      if (targetInventory.status !== ORDER_PRODUCT_STATUS.PUTTING_AWAY) {
        await trxMgr.getRepository(OrderInventory).save({
          ...targetInventory,
          status: ORDER_PRODUCT_STATUS.PUTTING_AWAY,
          updater: context.state.user
        })
      }

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

      await trxMgr.getRepository(Inventory).save({
        ...foundInventory,
        location: await trxMgr.getRepository(Location).findOne({
          where: { domain: context.state.domain, name: foundWorksheetDetail.fromLocation.name }
        }),
        status: INVENTORY_STATUS.UNLOADED,
        updater: context.state.user
      })
    })
  }
}
