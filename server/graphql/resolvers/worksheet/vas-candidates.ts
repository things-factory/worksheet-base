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
import { FindOperator, getManager, In } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { Bizplace } from '@things-factory/biz-base'

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
      const customerBizplace: Bizplace = worksheetDetail.bizplace
      const worksheet: Worksheet = worksheetDetail.worksheet
      if (!worksheet) throw new Error(`Can't find worksheet.`)
      const orderVas: OrderVas = worksheetDetail.targetVas

      let inventoryCondition: {
        id?: FindOperator<any>
        domain: Domain
        bizplace: Bizplace
        batchId?: string
        product?: Product
        packingType?: string
        orderProduct?: FindOperator<any>
        status: FindOperator<any>
      } = {
        domain: context.state.domain,
        bizplace: customerBizplace,
        status: In([
          INVENTORY_STATUS.UNLOADED,
          INVENTORY_STATUS.PARTIALLY_UNLOADED,
          INVENTORY_STATUS.PUTTING_AWAY,
          INVENTORY_STATUS.STORED,
          INVENTORY_STATUS.PICKED
        ])
      }

      if (orderVas.targetBatchId) inventoryCondition.batchId = orderVas.targetBatchId
      if (orderVas.targetProduct) inventoryCondition.product = orderVas.targetProduct
      if (orderVas.packingType) inventoryCondition.packingType = orderVas.packingType

      if (worksheet.arrivalNotice) {
        const orderProducts: OrderProduct[] = await trxMgr.getRepository(OrderProduct).find({
          where: {
            domain: context.state.domain,
            arrivalNotice: worksheet.arrivalNotice,
            bizplace: customerBizplace,
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
        inventoryCondition.orderProduct = In(orderProducts.map((ordProd: OrderProduct) => ordProd.id))
      } else if (worksheet.releaseGood) {
        const orderInventories: OrderInventory[] = await trxMgr.getRepository(OrderInventory).find({
          where: {
            domain: context.state.domain,
            releaseGood: worksheet.releaseGood,
            bizplace: customerBizplace,
            status: In([
              ORDER_INVENTORY_STATUS.READY_TO_PICK,
              ORDER_INVENTORY_STATUS.PICKING,
              ORDER_INVENTORY_STATUS.LOADING,
              ORDER_INVENTORY_STATUS.PICKED
            ])
          },
          relations: ['inventory']
        })

        const inventoryIds: string[] = orderInventories.map((ordInv: OrderInventory) => ordInv.inventory.id)
        if (inventoryIds?.length) {
          inventoryCondition.id = In(inventoryIds)
        } else {
          inventoryCondition.id = In([null])
        }
      }

      return await trxMgr.getRepository(Inventory).find({
        where: inventoryCondition,
        relations: ['product', 'location']
      })
    })
  }
}
