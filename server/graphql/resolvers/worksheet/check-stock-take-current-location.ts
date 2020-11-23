import { InventoryCheck, OrderInventory } from '@things-factory/sales-base'
import { Inventory } from '@things-factory/warehouse-base'
import { getRepository, Repository } from 'typeorm'

export const checkStockTakeCurrentLocationResolver = {
  async checkStockTakeCurrentLocation(_: any, { palletId, cycleCountNo }, context: any) {
    const invRepo: Repository<Inventory> = getRepository(Inventory)
    const inventoryCheckRepo: Repository<InventoryCheck> = getRepository(InventoryCheck)

    const inventory: Inventory = await invRepo.findOne({
      where: { domain: context.state.domain, palletId },
      relations: ['bizplace']
    })

    const cycleCount: InventoryCheck = await inventoryCheckRepo.findOne({
      where: { domain: context.state.domain, name: cycleCountNo },
      relations: [
        'orderInventories',
        'orderInventories.inventory',
        'orderInventories.inventory.location',
        'orderInventories.inventory.product'
      ]
    })

    const orderInventories: OrderInventory[] = cycleCount.orderInventories

    const foundInventory: Inventory = orderInventories.find(
      (oi: OrderInventory) => oi.inventory.palletId === inventory.palletId
    ).inventory

    if (!foundInventory) throw new Error(`${inventory.palletId} is not in cycle count worksheet`)

    return {
      currentLocation: foundInventory.location.name,
      palletId: foundInventory.palletId,
      batchId: foundInventory.batchId,
      qty: foundInventory.qty,
      uomValue: foundInventory.uomValue,
      uom: foundInventory.uom,
      productName: foundInventory.product.name,
      productDescription: foundInventory.product.description
    }
  }
}
