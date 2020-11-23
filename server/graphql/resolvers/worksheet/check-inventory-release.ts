import { OrderInventory, ORDER_INVENTORY_STATUS, ORDER_TYPES } from '@things-factory/sales-base'
import { Inventory } from '@things-factory/warehouse-base'
import { getRepository, In, Repository } from 'typeorm'

export const checkInventoryReleaseResolver = {
  async checkInventoryRelease(_: any, { palletId }, context: any) {
    const invRepo: Repository<Inventory> = getRepository(Inventory)
    const oiRepo: Repository<OrderInventory> = getRepository(OrderInventory)

    const inventory: Inventory = await invRepo.findOne({
      where: { domain: context.state.domain, palletId },
      relations: ['bizplace']
    })

    const oiStatuses: string[] = [
      ORDER_INVENTORY_STATUS.PENDING,
      ORDER_INVENTORY_STATUS.PENDING_RECEIVE,
      ORDER_INVENTORY_STATUS.READY_TO_PICK,
      ORDER_INVENTORY_STATUS.PICKING,
      ORDER_INVENTORY_STATUS.PENDING_CANCEL
    ]

    const orderInventories: OrderInventory[] = await oiRepo.find({
      where: { domain: context.state.domain, inventory, type: ORDER_TYPES.RELEASE_OF_GOODS, status: In(oiStatuses) }
    })

    return Boolean(orderInventories?.length > 0)
  }
}
