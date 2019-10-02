import { Inventory, InventoryHistory, InventoryNoGenerator, Location } from '@things-factory/warehouse-base'
import { getManager, getRepository } from 'typeorm'
import { WORKSHEET_STATUS } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const putaway = {
  async putaway(_: any, { palletId, toLocation }, context: any) {
    return await getManager().transaction(async () => {
      // 1. get inventory
      let inventory: Inventory = await getRepository(Inventory).findOne({
        where: { domain: context.state.domain, palletId }
      })
      if (!inventory) throw new Error(`Inventory doesn't exists`)

      // 2. get worksheet detail
      const worksheetDetail: WorksheetDetail = await getRepository(WorksheetDetail).findOne({
        where: { domain: context.state.domain, targetInventory: inventory, status: WORKSHEET_STATUS.EXECUTING },
        relations: ['worksheet']
      })
      if (!worksheetDetail) throw new Error(`Worksheet Details doesn't exists`)

      const worksheet: Worksheet = worksheetDetail.worksheet
      if (!worksheet) throw new Error(`Worksheet doesn't exists`)

      // 3. get to location object
      const location: Location = await getRepository(Location).findOne({
        where: { domain: context.state.domain, name: toLocation },
        relations: ['warehouse']
      })
      if (!location) throw new Error(`Location doesn't exists`)

      // 4. update location of inventory (buffer location => toLocation)
      inventory = await getRepository(Inventory).save({
        ...inventory,
        location,
        lastSeq: inventory.lastSeq + 1,
        warehouse: location.warehouse,
        zone: location.warehouse.zone,
        updater: context.state.user
      })

      // 5. add inventory history
      inventory = await getRepository(Inventory).findOne({
        where: { id: inventory.id },
        relations: ['bizplace', 'product', 'warehouse', 'location']
      })
      delete inventory.id
      await getRepository(InventoryHistory).save({
        ...inventory,
        domain: context.state.domain,
        name: InventoryNoGenerator.inventoryHistoryName(),
        seq: inventory.lastSeq,
        productId: inventory.product.id,
        warehouseId: inventory.warehouse.id,
        locationId: inventory.location.id,
        creator: context.state.user,
        updater: context.state.user
      })

      // 6. update status of worksheet details (EXECUTING => DONE)
      await getRepository(WorksheetDetail).save({
        ...worksheetDetail,
        status: WORKSHEET_STATUS.DONE,
        updater: context.state.user
      })
    })
  }
}
