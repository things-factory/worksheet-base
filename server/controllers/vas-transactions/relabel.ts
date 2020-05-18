import { Product } from '@things-factory/product-base'
import { OrderVas } from '@things-factory/sales-base'
import { Inventory, INVENTORY_TRANSACTION_TYPE } from '@things-factory/warehouse-base'
import { EntityManager, Repository } from 'typeorm'
import { generateInventoryHistory } from '../../utils'
import { AbstractVasTransaction, RefOrderType } from './AbstractVasTransaction'

interface OperationGuideDataInterface {
  toProduct: Product
}

export class Relabel extends AbstractVasTransaction<OperationGuideDataInterface, void> {
  operationGuideData: OperationGuideDataInterface

  constructor(trxMgr: EntityManager, orderVas: any, params: any, context: any) {
    super(trxMgr, orderVas, params, context, false)
  }

  async exec(): Promise<void> {
    const ovRepo: Repository<OrderVas> = this.trxMgr.getRepository(OrderVas)
    const prodRepo: Repository<Product> = this.trxMgr.getRepository(Product)
    const invRepo: Repository<Inventory> = this.trxMgr.getRepository(Inventory)

    this.orderVas = await ovRepo.findOne(this.orderVas.id, {
      relations: ['inventory', 'arrivalNotice', 'releaseGood', 'shippingOrder', 'vasOrder']
    })

    let inventory: Inventory = this.orderVas.inventory
    const refOrder: RefOrderType = this.getRefOrder()
    const toProduct: Product = await prodRepo.findOne(this.operationGuideData.toProduct.id)

    // Change product of inventory to have relation with toProduct
    inventory = await invRepo.save({
      ...inventory,
      product: toProduct,
      updater: this.user
    })

    await generateInventoryHistory(
      inventory,
      refOrder,
      INVENTORY_TRANSACTION_TYPE.RELABELING,
      0,
      0,
      this.user,
      this.trxMgr
    )
  }

  getUpdatedOperationGuideData(): { data: OperationGuideDataInterface; completed: boolean } {
    return null
  }
}
