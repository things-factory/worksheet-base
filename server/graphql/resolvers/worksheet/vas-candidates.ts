import { Product } from '@things-factory/product-base'
import { OrderInventory, OrderProduct, OrderVas } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory } from '@things-factory/warehouse-base'
import { FindOperator, getManager, In } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const vasCandidatesResolver = {
  async vasCandidates(_: any, { worksheetDetailId }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const worksheetDetail: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne(worksheetDetailId, {
        relations: [
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
      const orderVas: OrderVas = worksheetDetail.targetVas

      let inventoryCondition: {
        id?: FindOperator<any>
        domain: Domain
        batchId?: string
        product?: Product
        packingType?: string
        orderProduct?: FindOperator<any>
      } = { domain: context.state.domain }

      if (orderVas.targetBatchId) inventoryCondition.batchId = orderVas.targetBatchId
      if (orderVas.targetProduct) inventoryCondition.product = orderVas.targetProduct
      if (orderVas.packingType) inventoryCondition.packingType = orderVas.packingType

      let inventories: Inventory[]

      if (worksheet.arrivalNotice) {
        const orderProducts: OrderProduct[] = await trxMgr.getRepository(OrderProduct).find({
          where: { domain: context.state.domain, arrivalNotice: worksheet.arrivalNotice }
        })
        inventoryCondition.orderProduct = In(orderProducts.map((ordProd: OrderProduct) => ordProd.id))
      } else if (worksheet.releaseGood) {
        const orderInventories: OrderInventory[] = await trxMgr.getRepository(OrderInventory).find({
          where: { domain: context.state.domain, releaseGood: worksheet.releaseGood },
          relations: ['inventory']
        })
        inventoryCondition.id = In(orderInventories.map((ordInv: OrderInventory) => ordInv.inventory.id))
      }

      return await trxMgr.getRepository(Inventory).find({
        where: inventoryCondition
      })
    })
  }
}
