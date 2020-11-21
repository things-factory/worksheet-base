import { Product } from '@things-factory/product-base'
import { OrderInventory, OrderNoGenerator, ORDER_INVENTORY_STATUS } from '@things-factory/sales-base'
import { Inventory } from '@things-factory/warehouse-base'
import { EntityManager, getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { WorksheetNoGenerator } from '../../../utils'

export const generateReleaseGoodWorksheetDetailsResolver = {
  async generateReleaseGoodWorksheetDetails(
    _: any,
    { worksheetNo, batchId, productId, packingType, worksheetDetails },
    context: any
  ): Promise<void> {
    return await getManager().transaction(async (trxMgr: EntityManager) => {
      // 1. Remove prev worksheet details if it's exists
      const worksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
        where: { name: worksheetNo, domain: context.state.domain },
        relations: [
          'bizplace',
          'releaseGood',
          'worksheetDetails',
          'worksheetDetails.targetInventory',
          'worksheetDetails.targetInventory.product'
        ]
      })

      const prevWSDs: WorksheetDetail[] = worksheet.worksheetDetails.filter((wsd: WorksheetDetail) => {
        const targetInv: OrderInventory = wsd.targetInventory
        if (
          targetInv.batchId === batchId &&
          targetInv.product.id === productId &&
          targetInv.packingType === packingType
        )
          return wsd.id
      })

      // TODO: Delete order inventories
      if (prevWSDs?.length) {
        const wsdIds: string[] = prevWSDs.map((wsd: WorksheetDetail) => wsd.id)
        const prevOrderInvIds: string[] = prevWSDs.map((wsd: WorksheetDetail) => wsd.targetInventory.id)
        await trxMgr.getRepository(WorksheetDetail).delete(wsdIds)
        await trxMgr.getRepository(OrderInventory).delete(prevOrderInvIds)
      }

      await Promise.all(
        worksheetDetails.map(async (wsd: WorksheetDetail) => {
          // 2. Create order inventory
          let targetInventory: OrderInventory = wsd.targetInventory
          const inventory: Inventory = await trxMgr.getRepository(Inventory).findOne(targetInventory.inventory.id)

          targetInventory = await trxMgr.getRepository(OrderInventory).save({
            ...targetInventory,
            domain: context.state.domain,
            bizplace: worksheet.bizplace,
            name: OrderNoGenerator.orderInventory(),
            releaseGood: worksheet.releaseGood,
            inventory,
            batchId,
            status: ORDER_INVENTORY_STATUS.READY_TO_PICK,
            product: await trxMgr.getRepository(Product).findOne(productId),
            packingType,
            creator: context.state.user,
            updater: context.state.user
          })

          const currentLockedQty: any = inventory.lockedQty
          const currentLockedUomValue: any = inventory.lockedUomValue

          await trxMgr.getRepository(Inventory).save({
            ...targetInventory.inventory,
            lockedQty: Boolean(currentLockedQty)
              ? targetInventory.releaseQty + currentLockedQty
              : targetInventory.releaseQty,
            lockedUomValue: Boolean(currentLockedUomValue)
              ? targetInventory.releaseUomValue + currentLockedUomValue
              : targetInventory.releaseUomValue,
            updater: context.state.user
          })

          // 3. Create worksheet details
          await trxMgr.getRepository(WorksheetDetail).save({
            ...wsd,
            domain: context.state.domain,
            bizplace: worksheet.bizplace,
            worksheet,
            name: WorksheetNoGenerator.pickingDetail(),
            targetInventory,
            type: WORKSHEET_TYPE.PICKING,
            status: WORKSHEET_STATUS.DEACTIVATED,
            creator: context.state.user,
            updater: context.state.user
          })
        })
      )
    })
  }
}
