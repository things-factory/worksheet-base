import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import { OrderInventory, OrderNoGenerator, ReleaseGood } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory, INVENTORY_STATUS } from '@things-factory/warehouse-base'
import { EntityManager, getManager, In, SelectQueryBuilder } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { WorksheetController } from '../../../controllers/worksheet-controller'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { picking } from './picking/picking'

export const crossDockPickingResolver = {
  async crossDockPicking(
    _: any,
    {
      worksheetDetailName,
      palletId,
      releaseQty
    }: { worksheetDetailName: string; palletId: string; releaseQty: number },
    context: any
  ): Promise<void> {
    return await getManager().transaction(async (trxMgr: EntityManager) => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      const wsd: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
        where: { domain, name: worksheetDetailName },
        relations: [
          'targetInventory',
          'targetInventory.domain',
          'targetInventory.bizplace',
          'targetInventory.releaseGood',
          'targetInventory.product',
          'worksheet',
          'worksheet.releaseGood',
          'worksheet.releaseGood.arrivalNotice'
        ]
      })

      if (!wsd) throw new Error(`Failed to find picking worksheet detail by passed worksheet detail name`)
      const worksheet: Worksheet = wsd.worksheet
      const releaseGood: ReleaseGood = worksheet.releaseGood

      let targetInv: OrderInventory = wsd.targetInventory
      const bizplace: Bizplace = targetInv.bizplace
      let inventory: Inventory = await trxMgr.getRepository(Inventory).findOne({
        where: {
          domain,
          bizplace,
          palletId,
          status: In([INVENTORY_STATUS.STORED, INVENTORY_STATUS.PARTIALLY_UNLOADED, INVENTORY_STATUS.UNLOADED])
        },
        relations: ['product', 'location']
      })

      if (!inventory) throw new Error(`Failed to find inventory by passed pallet ID (${palletId})`)
      const hasSameCondition: boolean =
        inventory.batchId === targetInv.batchId &&
        inventory.product.id === targetInv.product.id &&
        inventory.packingType === targetInv.packingType
      if (!hasSameCondition) throw new Error(`Pallet (${palletId}) doesn't have same condition compared with order has`)
      if (inventory.qty < releaseQty) throw new Error(`Release qty is bigger than what pallet has`)
      if (targetInv.releaseQty < releaseQty) throw new Error(`Release qty is bigger than required qty`)

      const unitWeight: number = inventory.weight / inventory.qty
      const releaseWeight: number = releaseQty * unitWeight
      const remainQty: number = targetInv.releaseQty - releaseQty
      const remainWeight: number = targetInv.releaseWeight - releaseWeight

      const originWSD: WorksheetDetail = await fetchOriginalWSD(
        trxMgr,
        domain.id,
        releaseGood.id,
        targetInv.batchId,
        targetInv.packingType,
        targetInv.product.id,
        inventory.id
      )

      if (!originWSD) {
        // Update target inventory information
        // 1. update release amount
        // 2. assign inventory
        targetInv.releaseQty = releaseQty
        targetInv.releaseWeight = releaseWeight

        targetInv.inventory = inventory
        targetInv = await trxMgr.getRepository(OrderInventory).save(targetInv)

        if (remainQty > 0 || remainWeight > 0) {
          // Need to create order inventory and worksheet detail without inventory assignment
          let targetInventory: OrderInventory = Object.assign({}, targetInv)
          delete targetInventory.id
          targetInventory.name = OrderNoGenerator.orderInventory()
          targetInventory.releaseQty = remainQty
          targetInventory.releaseWeight = remainWeight
          targetInventory.inventory = null
          targetInventory.creator = user
          targetInventory.updater = user
          targetInventory = await trxMgr.getRepository(OrderInventory).save(targetInventory)

          const worksheetController: WorksheetController = new WorksheetController(trxMgr, domain, user)
          worksheetController.createWorksheetDetails(worksheet, WORKSHEET_TYPE.PICKING, [targetInventory])
        }
      } else {
        let { targetInventory: originOrdInv } = await trxMgr.getRepository(WorksheetDetail).findOne(originWSD.id, {
          relations: ['targetInventory']
        })
        originOrdInv.releaseQty += releaseQty
        originOrdInv.releaseWeight += releaseWeight
        originOrdInv.updater = user
        await trxMgr.getRepository(OrderInventory).save(originOrdInv)

        targetInv.releaseQty -= releaseQty
        targetInv.releaseWeight -= releaseWeight
        targetInv.updater = user

        if (targetInv.releaseQty === 0 || targetInv.releaseWeight === 0) {
          // Delete worksheet detail
          await trxMgr.getRepository(WorksheetDetail).delete(wsd.id)
          // Delete order inventory
          await trxMgr.getRepository(OrderInventory).delete(targetInv.id)
        } else {
          await trxMgr.getRepository(OrderInventory).save(targetInv)
        }
      }

      await picking(trxMgr, domain, user, worksheetDetailName, inventory.palletId, inventory.location.name, releaseQty)
    })
  }
}

export async function fetchOriginalWSD(
  trxMgr: EntityManager,
  domainId: string,
  releaseGoodId: string,
  batchId: string,
  packingType: string,
  productId: string,
  inventoryId: string
): Promise<WorksheetDetail> {
  let qb: SelectQueryBuilder<WorksheetDetail> = trxMgr.createQueryBuilder(WorksheetDetail, 'wsd')
  return qb
    .leftJoin(OrderInventory, 'oi', 'wsd.target_inventory_id = oi.id')
    .leftJoin(Inventory, 'inv', 'oi.inventory_id = inv.id')
    .andWhere('wsd.domain_id = :domainId')
    .andWhere('wsd.status = :status')
    .andWhere('oi.release_good_id = :releaseGoodId')
    .andWhere('oi.batch_id = :batchId')
    .andWhere('oi.packing_type = :packingType')
    .andWhere('oi.product_id = :productId')
    .andWhere('inv.id = :inventoryId')
    .setParameters({
      domainId,
      status: WORKSHEET_STATUS.DONE,
      releaseGoodId,
      batchId,
      packingType,
      productId,
      inventoryId
    })
    .getOne()
}
