import { OrderInventory, ORDER_INVENTORY_STATUS, ReleaseGood } from '@things-factory/sales-base'
import {
  Inventory,
  InventoryNoGenerator,
  INVENTORY_STATUS,
  INVENTORY_TRANSACTION_TYPE,
  Location,
  LOCATION_STATUS
} from '@things-factory/warehouse-base'
import { getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { generateInventoryHistory } from '../../../utils/inventory-history-generator'

export const returning = {
  async returning(_: any, { worksheetDetailName, palletId, toLocation }, context: any) {
    return await getManager().transaction(async trxMgr => {
      // 1. get worksheet detail
      const worksheetDetail: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
        where: {
          domain: context.state.domain,
          name: worksheetDetailName,
          status: WORKSHEET_STATUS.EXECUTING,
          type: WORKSHEET_TYPE.RETURN
        },
        relations: [
          'bizplace',
          'worksheet',
          'worksheet.releaseGood',
          'targetInventory',
          'targetInventory.inventory',
          'targetInventory.inventory.location'
        ]
      })
      if (!worksheetDetail) throw new Error(`Worksheet Details doesn't exists`)
      const releaseGood: ReleaseGood = worksheetDetail.worksheet.releaseGood
      let targetInventory: OrderInventory = worksheetDetail.targetInventory
      let inventory: Inventory = targetInventory.inventory
      if (inventory.palletId !== palletId) throw new Error('Pallet ID is invalid')

      const worksheet: Worksheet = worksheetDetail.worksheet
      if (!worksheet) throw new Error(`Worksheet doesn't exists`)

      // 3. get to location object
      const foundLocation: Location = await trxMgr.getRepository(Location).findOne({
        where: { domain: context.state.domain, name: toLocation },
        relations: ['warehouse']
      })
      if (!foundLocation) throw new Error(`Location doesn't exists`)

      // Case 1. Return back with same pallet before picked.
      if (foundLocation.id === inventory.location.id && palletId === inventory.palletId) {
        // Plus returing qty and weight
        inventory = await trxMgr.getRepository(Inventory).save({
          ...inventory,
          qty: inventory.qty + targetInventory.releaseQty,
          weight: inventory.qty + targetInventory.releaseWeight,
          status: INVENTORY_STATUS.STORED,
          updater: context.state.user
        })
      } else {
        // Case 2. Return back with diff pallet before picked.
        // Create new inventory record
        const duplicatedPalletCnt: number = await trxMgr.getRepository(Inventory).count({
          domain: context.state.domain,
          bizplace: worksheetDetail.bizplace,
          status: INVENTORY_STATUS.STORED,
          palletId
        })

        if (duplicatedPalletCnt) throw new Error('Pallet ID is duplicated')

        const newInventory: Inventory = {
          ...inventory,
          palletId,
          name: InventoryNoGenerator.inventoryName(),
          qty: targetInventory.releaseQty,
          weight: targetInventory.releaseWeight,
          warehouse: foundLocation.warehouse,
          location: foundLocation,
          zone: foundLocation.zone,
          status: INVENTORY_STATUS.STORED,
          creator: context.state.user,
          updater: context.state.user
        }
        delete newInventory.id

        inventory = await trxMgr.getRepository(Inventory).save(newInventory)
      }

      // 4. 1) Update status of location
      if (foundLocation.status === LOCATION_STATUS.EMPTY) {
        await trxMgr.getRepository(Location).save({
          ...foundLocation,
          status: LOCATION_STATUS.OCCUPIED,
          updater: context.state.user
        })
      }

      await generateInventoryHistory(
        inventory,
        releaseGood,
        INVENTORY_TRANSACTION_TYPE.RETURN,
        targetInventory.releaseQty,
        targetInventory.releaseWeight,
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
