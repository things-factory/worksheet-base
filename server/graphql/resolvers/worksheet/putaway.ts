import { Inventory, Location, LOCATION_STATUS } from '@things-factory/warehouse-base'
import { Equal, getManager, getRepository, Not, IsNull } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { WorksheetDetail } from '../../../entities'
import { InventoryNoGenerator } from '../../../utils/inventory-no-generator'

export const putaway = {
  async putaway(_: any, { worksheetDetail, inventory, qty, isLocationFull }, context: any) {
    return await getManager().transaction(async () => {
      const toLocation: Location = await getRepository(Location).findOne({
        domain: context.state.domain,
        name: worksheetDetail.toLocation.name,
        status: Not(Equal(LOCATION_STATUS.FULL))
      })

      // 1. validity of location
      if (!toLocation) throw new Error('Location is not valid')

      const worksheetDetailName = worksheetDetail.name
      const palletId = inventory.palletId

      // 1. find worksheetDetail
      const foundWorksheetDetail: WorksheetDetail = await getRepository(WorksheetDetail).findOne({
        where: {
          domain: context.state.domain,
          name: worksheetDetailName,
          status: WORKSHEET_STATUS.EXECUTING,
          type: WORKSHEET_TYPE.PUTAWAY
        },
        relations: ['bizplace', 'toLocation']
      })

      if (!foundWorksheetDetail) throw new Error("Worksheet doesn't exists")

      // 2. update inventory from buffer location to shelf location
      const targetInventory: Inventory = await getRepository(Inventory).findOne({
        where: { domain: context.state.domain, palletId, refInventory: IsNull() },
        relations: ['domain', 'bizplace', 'product', 'warehouse', 'location']
      })

      const remainQty = targetInventory.qty - qty
      if (remainQty > 0) {
        // save removed value of buffer inventory
        await getRepository(Inventory).save({
          ...targetInventory,
          qty: remainQty,
          updater: context.state.user
        })

        const splitedInventory: Inventory = {
          ...targetInventory,
          refInventory: targetInventory,
          qty,
          location: toLocation,
          creator: context.state.user,
          updater: context.state.user
        }
        delete splitedInventory.id

        // create new shelf inventory
        await getRepository(Inventory).save(splitedInventory)
      } else if (remainQty === 0) {
        await getRepository(Inventory).save({
          ...targetInventory,
          name: InventoryNoGenerator.inventoryName(),
          location: toLocation,
          creator: context.state.user,
          updater: context.state.user
        })
      } else if (remainQty < 0) {
        throw new Error('Invalid input value of qty')
      }

      // 3. update status of worksheetDetail (EXECUTING => DONE)
      if (remainQty === 0) {
        await getRepository(WorksheetDetail).save({
          ...foundWorksheetDetail,
          status: WORKSHEET_STATUS.DONE,
          updater: context.state.user
        })
      }

      // 4. Update location info (if it's full or empty)
      let locationStatus: String = LOCATION_STATUS.OCCUPIED
      if (toLocation.status === LOCATION_STATUS.EMPTY && !isLocationFull) {
        locationStatus = LOCATION_STATUS.OCCUPIED
      } else if (isLocationFull) {
        locationStatus = LOCATION_STATUS.FULL
      }

      await getRepository(Location).save({
        ...toLocation,
        status: locationStatus
      })
    })
  }
}
