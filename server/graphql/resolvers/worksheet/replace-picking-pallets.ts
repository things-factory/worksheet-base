import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import {
  OrderInventory,
  OrderNoGenerator,
  ORDER_INVENTORY_STATUS,
  ORDER_TYPES,
  ReleaseGood
} from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory } from '@things-factory/warehouse-base'
import { getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { WorksheetNoGenerator } from '../../../utils'
import { picking } from './picking/picking'

export const replacePickingPalletsResolver = {
  async replacePickingPallets(_: any, { worksheetDetailName, inventories, returnLocation }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const domain: Domain = context.state.domain
      const user: User = context.state.user
      const prevWSD: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
        where: { domain, name: worksheetDetailName },
        relations: ['bizplace', 'worksheet', 'worksheet.releaseGood', 'targetInventory', 'targetInventory.inventory']
      })
      const prevOrderInv: OrderInventory = prevWSD.targetInventory
      const prevInv: Inventory = prevOrderInv.inventory
      const batchId: string = prevOrderInv.batchId
      const productName: string = prevOrderInv.productName
      const packingType: string = prevOrderInv.packingType

      const worksheet: Worksheet = prevWSD.worksheet
      const releaseGood: ReleaseGood = worksheet.releaseGood
      const customerBizplace: Bizplace = prevWSD.bizplace

      // remove locked qty and locked uomValue
      await trxMgr.getRepository(Inventory).save({
        ...prevInv,
        lockedQty: 0,
        lockedWeight: 0,
        lockedUomValue: 0,
        updater: user
      })

      // 2. update status of previous order Inventory
      await trxMgr.getRepository(OrderInventory).save({
        ...prevOrderInv,
        status: ORDER_INVENTORY_STATUS.REPLACED,
        updater: user
      })

      // 3. update status of prev worksheet detail
      await trxMgr.getRepository(WorksheetDetail).save({
        ...prevWSD,
        status: WORKSHEET_STATUS.REPLACED,
        updater: user
      })

      await Promise.all(
        inventories.map(async (inventory: Inventory) => {
          const foundInv: Inventory = await trxMgr.getRepository(Inventory).findOne({
            where: {
              domain,
              palletId: inventory.palletId
            },
            relations: ['location']
          })
          const unitUomValue: number = foundInv.uomValue / foundInv.qty

          // 4. create new order inventories
          const targetInventory: OrderInventory = await trxMgr.getRepository(OrderInventory).save({
            domain,
            bizplace: customerBizplace,
            name: OrderNoGenerator.orderInventory(),
            releaseGood,
            releaseQty: inventory.qty,
            releaseWeight: 0,
            releaseUomValue: unitUomValue * inventory.qty,
            inventory: foundInv,
            batchId,
            type: ORDER_TYPES.RELEASE_OF_GOODS,
            status: ORDER_INVENTORY_STATUS.PICKING,
            productName,
            packingType,
            creator: user,
            updater: user
          })

          // 5. create new worksheet details
          const wsd: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).save({
            domain,
            bizplace: customerBizplace,
            worksheet,
            name: WorksheetNoGenerator.pickingDetail(),
            targetInventory,
            type: WORKSHEET_TYPE.PICKING,
            status: WORKSHEET_STATUS.EXECUTING,
            creator: user,
            updater: user
          })

          // 6. execute picking transaction
          await picking(trxMgr, domain, user, wsd.name, inventory.palletId, returnLocation, inventory.qty)
        })
      )
    })
  }
}
