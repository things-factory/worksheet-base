import { Bizplace } from '@things-factory/biz-base'
import { Product } from '@things-factory/product-base'
import {
  OrderInventory,
  OrderProduct,
  OrderVas,
  ORDER_INVENTORY_STATUS,
  ORDER_PRODUCT_STATUS
} from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory, INVENTORY_STATUS } from '@things-factory/warehouse-base'
import { EntityManager, FindOperator, getManager, In } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../entities'

enum OrderType {
  ArrivalNotice,
  ReleaseGood,
  VasOrder
}
interface IInventoryCondition {
  id?: FindOperator<any>
  domain: Domain
  bizplace: Bizplace
  batchId?: string
  product?: Product
  packingType?: string
  orderProduct?: FindOperator<any>
  status?: FindOperator<any>
}

export const vasCandidatesResolver = {
  async vasCandidates(_: any, { worksheetDetailId }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const worksheetDetail: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne(worksheetDetailId, {
        relations: [
          'bizplace',
          'worksheet',
          'worksheet.arrivalNotice',
          'worksheet.releaseGood',
          'worksheet.vasOrder',
          'targetVas',
          'targetVas.targetProduct'
        ]
      })

      const worksheet: Worksheet = worksheetDetail.worksheet
      if (!worksheet) throw new Error(`Can't find worksheet.`)

      const domain: Domain = context.state.domain
      const bizplace: Bizplace = worksheetDetail.bizplace
      const orderVas: OrderVas = worksheetDetail.targetVas
      const orderType: OrderType = worksheet.arrivalNotice
        ? OrderType.ArrivalNotice
        : worksheet.releaseGood
        ? OrderType.ReleaseGood
        : OrderType.VasOrder

      const inventoryCondition: IInventoryCondition = await buildInventoryCondition(
        trxMgr,
        domain,
        bizplace,
        worksheet,
        orderType,
        orderVas
      )

      let inventories: Inventory = await trxMgr.getRepository(Inventory).find({
        where: inventoryCondition,
        relations: ['product', 'location']
      })

      /**
       * @description
       * If current worksheet is comes together with release good.
       * VAS order should be done before processing loading.
       * And qty and weight information for target inventories should be originated from orderInventories
       */

      if (orderType === OrderType.ReleaseGood) {
        inventories = await Promise.all(
          inventories.map(async (inventory: Inventory) => {
            const orderInv: OrderInventory = await trxMgr.getRepository(OrderInventory).findOne({
              where: {
                domain,
                bizplace,
                inventory,
                releaseGood: worksheet.releaseGood,
                status: In([ORDER_INVENTORY_STATUS.PICKED])
              }
            })
            return {
              ...inventory,
              qty: orderInv.releaseQty,
              weight: orderInv.releaseWeight
            }
          })
        )
      }

      return inventories
    })
  }
}

async function buildInventoryCondition(
  trxMgr: EntityManager,
  domain: Domain,
  bizplace: Bizplace,
  worksheet: Worksheet,
  orderType: OrderType,
  orderVas: OrderVas
): Promise<IInventoryCondition> {
  let condition: IInventoryCondition = { domain, bizplace }

  if (orderVas.targetBatchId) condition.batchId = orderVas.targetBatchId
  if (orderVas.targetProduct) condition.product = orderVas.targetProduct
  if (orderVas.packingType) condition.packingType = orderVas.packingType

  switch (orderType) {
    case OrderType.ArrivalNotice:
      const orderProducts: OrderProduct[] = await trxMgr.getRepository(OrderProduct).find({
        where: {
          domain,
          bizplace,
          arrivalNotice: worksheet.arrivalNotice,
          status: In([
            ORDER_PRODUCT_STATUS.READY_TO_UNLOAD,
            ORDER_PRODUCT_STATUS.UNLOADING,
            ORDER_PRODUCT_STATUS.PARTIALLY_UNLOADED,
            ORDER_PRODUCT_STATUS.UNLOADED,
            ORDER_PRODUCT_STATUS.PUTTING_AWAY,
            ORDER_PRODUCT_STATUS.STORED
          ])
        }
      })

      condition.orderProduct = In(orderProducts.map((ordProd: OrderProduct) => ordProd.id))
      condition.status = In([
        INVENTORY_STATUS.UNLOADED,
        INVENTORY_STATUS.PARTIALLY_UNLOADED,
        INVENTORY_STATUS.PUTTING_AWAY,
        INVENTORY_STATUS.STORED
      ])
      break

    case OrderType.ReleaseGood:
      const orderInventories: OrderInventory[] = await trxMgr.getRepository(OrderInventory).find({
        where: {
          domain,
          bizplace,
          releaseGood: worksheet.releaseGood,
          status: In([ORDER_INVENTORY_STATUS.PICKED])
        },
        relations: ['inventory']
      })

      const inventoryIds: string[] = orderInventories.map((ordInv: OrderInventory) => ordInv.inventory.id)
      condition.id = inventoryIds?.length ? In(inventoryIds) : In([null])
      condition.status = In([INVENTORY_STATUS.PICKED, INVENTORY_STATUS.TERMINATED, INVENTORY_STATUS.STORED])
      break

    case OrderType.VasOrder:
      condition.status = In([INVENTORY_STATUS.STORED])
  }

  return condition
}
