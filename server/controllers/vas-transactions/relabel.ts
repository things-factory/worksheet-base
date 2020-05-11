import { User } from '@things-factory/auth-base'
import { Product } from '@things-factory/product-base'
import { OrderVas } from '@things-factory/sales-base'
import { Inventory, INVENTORY_TRANSACTION_TYPE } from '@things-factory/warehouse-base'
import { EntityManager, Repository } from 'typeorm'
import { generateInventoryHistory } from '../../utils'

export async function relabel(trxMgr: EntityManager, orderVas: OrderVas, context: any): Promise<void> {
  const ovRepo: Repository<OrderVas> = trxMgr.getRepository(OrderVas)
  const prodRepo: Repository<Product> = trxMgr.getRepository(Product)
  const invRepo: Repository<Inventory> = trxMgr.getRepository(Inventory)

  orderVas = await ovRepo.findOne(orderVas.id, {
    relations: ['inventory', 'arrivalNotice', 'releaseGood', 'shippingOrder', 'vasOrder']
  })

  const operationGuide: any = JSON.parse(orderVas.operationGuide)
  let inventory: Inventory = orderVas.inventory
  const refOrder: any = orderVas.arrivalNotice || orderVas.releaseGood || orderVas.shippingOrder || orderVas.vasOrder
  const toProduct: Product = await prodRepo.findOne(operationGuide.data.toProduct.id)
  const user: User = context.state.user

  // Change product to toProduct
  inventory = await invRepo.save({
    ...inventory,
    product: toProduct,
    updater: user
  })

  // Generate inventory hisotry with relabeling transaction type
  await generateInventoryHistory(
    inventory,
    refOrder,
    INVENTORY_TRANSACTION_TYPE.RELABELING,
    inventory.qty,
    inventory.weight,
    user,
    trxMgr
  )
}
