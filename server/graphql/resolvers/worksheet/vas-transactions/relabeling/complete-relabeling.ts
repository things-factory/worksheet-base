import { User } from '@things-factory/auth-base'
import { Product } from '@things-factory/product-base'
import { OrderVas } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory, INVENTORY_TRANSACTION_TYPE } from '@things-factory/warehouse-base'
import { EntityManager } from 'typeorm'
import { generateInventoryHistory } from '../../../../..//utils'
import { OperationGuideInterface, RefOrderType } from '../intefaces'
import { RelabelingGuide } from '../intefaces/relabeling'

export async function completeRelabeling(trxMgr: EntityManager, orderVas: OrderVas, user: User) {
  orderVas = await trxMgr.getRepository(OrderVas).findOne(orderVas.id, {
    relations: ['domain', 'inventory', 'inventory.product', 'arrivalNotice', 'releaseGood', 'shippingOrder', 'vasOrder']
  })

  const domain: Domain = orderVas.domain
  let originInv: Inventory = orderVas.inventory
  let refOrder: RefOrderType
  if (orderVas.arrivalNotice) {
    refOrder = orderVas.arrivalNotice
  } else if (orderVas.releaseGood) {
    refOrder = orderVas.releaseGood
  } else if (orderVas.shippingOrder) {
    refOrder = orderVas.shippingOrder
  } else if (orderVas.vasOrder) {
    refOrder = orderVas.vasOrder
  }

  const operationGuide: OperationGuideInterface<RelabelingGuide> = orderVas.operationGuide
  const operationGuideData: RelabelingGuide = operationGuide.data

  const toBatchId: string = operationGuideData?.toBatchId
  const toProductId: string = operationGuideData?.toProduct?.id

  if (toBatchId && toProductId) throw new Error(`Invalid target inforation both batch id and product id doesn't exists`)

  if (toBatchId) {
    originInv.batchId = toBatchId
  }

  if (toProductId) {
    const toProduct: Product = await trxMgr.getRepository(Product).findOne({
      where: { domain, id: toProductId }
    })

    if (toProduct) throw new Error(`Couldn't find product, via Product ID: (${toProductId})`)
    originInv.product = toProduct
  }

  originInv = await trxMgr.getRepository(Inventory).save({
    ...originInv,
    updater: user
  })

  await generateInventoryHistory(originInv, refOrder, INVENTORY_TRANSACTION_TYPE.RELABELING, 0, 0, user, trxMgr)
}
