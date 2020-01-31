import { Bizplace } from '@things-factory/biz-base'
import { OrderInventory, ORDER_INVENTORY_STATUS, ReleaseGood } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import {
  Inventory,
  InventoryNoGenerator,
  INVENTORY_STATUS,
  INVENTORY_TRANSACTION_TYPE,
  Location,
  LOCATION_STATUS
} from '@things-factory/warehouse-base'
import { EntityManager, Equal, getManager, getRepository, Not, Repository } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { generateInventoryHistory, switchLocationStatus } from '../../../utils'

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
          'targetInventory.inventory.refOrder',
          'targetInventory.inventory.bizplace',
          'targetInventory.inventory.product',
          'targetInventory.inventory.warehouse',
          'targetInventory.inventory.location'
        ]
      })
      if (!worksheetDetail) throw new Error(`Worksheet Details doesn't exists`)
      const releaseGood: ReleaseGood = worksheetDetail.worksheet.releaseGood
      let targetInventory: OrderInventory = worksheetDetail.targetInventory
      let inventory: Inventory = targetInventory.inventory

      const worksheet: Worksheet = worksheetDetail.worksheet
      if (!worksheet) throw new Error(`Worksheet doesn't exists`)

      const originLocation: Location = inventory.location
      const originPalletId: string = inventory.palletId
      // 3. get to location object
      const foundLocation: Location = await trxMgr.getRepository(Location).findOne({
        where: { domain: context.state.domain, name: toLocation },
        relations: ['warehouse']
      })
      if (!foundLocation) throw new Error(`Location doesn't exists`)

      const isPalletDiff: boolean = originPalletId === palletId
      const isLocationDiff: boolean = originLocation.id === foundLocation.id

      if ((foundLocation.status !== LOCATION_STATUS.EMPTY && isPalletDiff) || isLocationDiff)
        throw new Error(`Location is already occupied.`)

      // Case 1. Return back with SAME PALLET and SAME LOCATION.
      //      1) sum stored qty and returned qty
      if (!isPalletDiff && !isLocationDiff) {
        inventory = await trxMgr.getRepository(Inventory).save({
          ...inventory,
          qty: inventory.qty + targetInventory.releaseQty,
          weight: inventory.weight + targetInventory.releaseWeight,
          status: INVENTORY_STATUS.STORED,
          updater: context.state.user
        })

        // Case 2. Return back with SAME PALLET but DIFF LOCATION.
        //      1) check existing of stored pallet
        //      1). a. if yes throw error (Pallet ID can't be duplicated)
        //      1). b. if no (update qty and status and location)
      } else if (!isPalletDiff && isLocationDiff) {
        const isDuplicated: boolean = await checkPalletDuplication(
          context.state.domain,
          worksheetDetail.bizplace,
          palletId,
          trxMgr
        )
        if (isDuplicated) {
          throw new Error('Pallet ID is duplicated.')
        } else {
          inventory = await trxMgr.getRepository(Inventory).save({
            ...inventory,
            qty: inventory.qty + targetInventory.releaseQty,
            weight: inventory.weight + targetInventory.releaseWeight,
            status: INVENTORY_STATUS.STORED,
            updater: context.state.user
          })
        }

        // Case 3. Return back with DIFF PALLET and SAME LOCATION.
        //      1) Check pallet duplication
        //      1) a. if yes throw error (Pallet ID can't be duplicated)
        //      2) Check existing of stored pallet in the location
        //      2) a. if yes throw error (Multiple pallet can't be stored in single location)
        //      3) Create new inventory which has origin inventory as ref_inventory
      } else {
        const isDuplicated: boolean = await checkPalletDuplication(
          context.state.domain,
          worksheetDetail.bizplace,
          palletId,
          trxMgr
        )
        if (isDuplicated) throw new Error('Pallet ID is duplicated.')
        const newInventory: Inventory = {
          ...inventory,
          domain: context.state.domain,
          bizplace: worksheetDetail.bizplace,
          name: InventoryNoGenerator.inventoryName(),
          palletId,
          qty: targetInventory.releaseQty,
          weight: targetInventory.releaseWeight,
          status: INVENTORY_STATUS.STORED,
          refInventory: inventory,
          warehouse: foundLocation.warehouse,
          location: foundLocation,
          zone: foundLocation.zone,
          creator: context.state.user,
          updater: context.state.user
        }
        delete newInventory.id
        inventory = await trxMgr.getRepository(Inventory).save(newInventory)
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

      // 6. update status of location
      await switchLocationStatus(context.state.domain, foundLocation, context.state.user, trxMgr)

      // 7. update status of order inventory
      await trxMgr.getRepository(OrderInventory).save({
        ...targetInventory,
        status: ORDER_INVENTORY_STATUS.TERMINATED,
        updater: context.state.user
      })

      // 8. update status of worksheet details (EXECUTING => DONE)
      await trxMgr.getRepository(WorksheetDetail).save({
        ...worksheetDetail,
        status: WORKSHEET_STATUS.DONE,
        updater: context.state.user
      })
    })
  }
}

export async function checkPalletDuplication(
  domain: Domain,
  bizplace: Bizplace,
  palletId: string,
  trxMgr?: EntityManager
): Promise<boolean> {
  const invRepo: Repository<Inventory> = trxMgr?.getRepository(Inventory) || getRepository(Inventory)
  const duplicatedPalletCnt: number = await invRepo.count({
    domain,
    bizplace,
    status: Not(Equal(INVENTORY_STATUS.TERMINATED)),
    palletId
  })

  return Boolean(duplicatedPalletCnt)
}
