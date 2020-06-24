import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import {
  ArrivalNotice,
  OrderNoGenerator,
  OrderVas,
  OrderInventory,
  ORDER_INVENTORY_STATUS,
  ReleaseGood,
  VAS_TARGET_TYPES
} from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory, INVENTORY_STATUS } from '@things-factory/warehouse-base'
import { EntityManager, FindManyOptions, getManager, In } from 'typeorm'
import { WorksheetDetail } from '../../../../../entities'
import { WorksheetNoGenerator } from '../../../../../utils'
import { RefOrderType } from '../intefaces'

export const assignRelabelInventoriesResolver = {
  async assignRelabelInventories(_: any, { worksheetDetailName }, context: any): Promise<void> {
    return await getManager().transaction(
      async (trxMgr: EntityManager): Promise<void> => {
        /**
         * Initialize required variables
         */
        const domain: Domain = context.state.domain
        const user: User = context.state.user

        // Find target worksheet detail & target order vas
        const wsd: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
          where: { domain, name: worksheetDetailName },
          relations: [
            'bizplace',
            'targetVas',
            'targetVas.inventory',
            'targetVas.inventory.product',
            'targetVas.vas',
            'targetVas.arrivalNotice',
            'targetVas.releaseGood',
            'targetVas.shippingOrder',
            'targetVas.vasOrder',
            'targetVas.targetProduct',
            'worksheet'
          ]
        })
        if (!wsd) throw new Error(`Couldn't find target worksheet detail`)
        const bizplace: Bizplace = wsd.bizplace
        let targetVas: OrderVas = wsd.targetVas
        if (!targetVas) throw new Error(`Couldn't find target vas`)
        const targetType: string = targetVas.targetType

        let refOrder: RefOrderType
        if (targetVas?.arrivalNotice?.id) {
          refOrder = targetVas.arrivalNotice
        } else if (targetVas?.releaseGood?.id) {
          refOrder = targetVas.releaseGood
        } else if (targetVas?.shippingOrder?.id) {
          refOrder = targetVas.shippingOrder
        } else if (targetVas?.vasOrder?.id) {
          refOrder = targetVas.vasOrder
        }
        if (!refOrder) throw new Error(`Couldn't find reference order with current order vas`)

        if (refOrder instanceof ArrivalNotice) {
          // get every unloaded pallets
          let findOptions: FindManyOptions<Inventory> = {
            where: {
              domain,
              bizplace,
              status: In([INVENTORY_STATUS.UNLOADED, INVENTORY_STATUS.PUTTING_AWAY]),
              refOrderId: refOrder.id
            }
          }

          if (targetType === VAS_TARGET_TYPES.BATCH_NO) {
            findOptions.where.batchId = targetVas.targetBatchId
          } else if (targetType === VAS_TARGET_TYPES.PRODUCT) {
            findOptions.where.product = targetVas.targetProduct
          } else if (targetType === VAS_TARGET_TYPES.BATCH_AND_PRODUCT_TYPE) {
            findOptions.where.batchId = targetVas.targetBatchId
            findOptions.where.product = targetVas.targetProduct
          }

          const unloadedInvs: Inventory[] = await trxMgr.getRepository(Inventory).find(findOptions)
          if (!unloadedInvs?.length) throw new Error(`Counldn't find unloaded inventories`)

          for (const unloadedInv of unloadedInvs) {
            await addAssignedNewVasTask(trxMgr, domain, bizplace, targetVas, user, wsd, unloadedInv)
          }
        } else if (refOrder instanceof ReleaseGood) {
          let pickedOrdInv: OrderInventory = await trxMgr.getRepository(OrderInventory).find({
            where: { domain, bizplace, releaseGood: refOrder, status: ORDER_INVENTORY_STATUS.PICKED },
            relations: ['inventory', 'inventory.product']
          })

          const pickedInvs: Inventory[] = pickedOrdInv
            .map((oi: OrderInventory) => oi.inventory)
            .filter((inv: Inventory) => {
              if (targetType === VAS_TARGET_TYPES.BATCH_NO) {
                return inv.batchId === targetVas.targetBatchId
              } else if (targetType === VAS_TARGET_TYPES.PRODUCT) {
                return inv.product.id === targetVas.targetProduct.id
              } else if (targetType === VAS_TARGET_TYPES.BATCH_AND_PRODUCT_TYPE) {
                return inv.batchId === targetVas.targetBatchId && inv.product.id === targetVas.targetProduct.id
              }
            })

          for (const pickedInv of pickedInvs) {
            await addAssignedNewVasTask(trxMgr, domain, bizplace, targetVas, user, wsd, pickedInv)
          }
        }

        await trxMgr.getRepository(WorksheetDetail).delete(wsd.id)
        await trxMgr.getRepository(OrderVas).delete(targetVas.id)
      }
    )
  }
}

async function addAssignedNewVasTask(
  trxMgr: EntityManager,
  domain: Domain,
  bizplace: Bizplace,
  targetVas: OrderVas,
  user: User,
  wsd: WorksheetDetail,
  inventory: Inventory
): Promise<OrderVas> {
  // 새로운 order vas와 worksheet detail 생성
  const copiedTargetVas: OrderVas = Object.assign({}, targetVas)
  delete copiedTargetVas.id

  let newTargetVas: OrderVas = {
    ...copiedTargetVas,
    domain,
    bizplace,
    name: OrderNoGenerator.orderVas(),
    inventory,
    creator: user,
    updater: user
  }
  newTargetVas = await trxMgr.getRepository(OrderVas).save(newTargetVas)

  const copiedWSD: WorksheetDetail = Object.assign({}, wsd)
  delete copiedWSD.id

  const newWSD: WorksheetDetail = {
    ...copiedWSD,
    domain,
    bizplace,
    name: WorksheetNoGenerator.vasDetail(),
    seq: wsd.seq++,
    targetVas: newTargetVas,
    creator: user,
    updater: user
  }
  await trxMgr.getRepository(WorksheetDetail).save(newWSD)
}
