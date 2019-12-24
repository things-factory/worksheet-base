import { ORDER_STATUS, Bizplace, ReleaseGood } from '@things-factory/sales-base'
import { INVENTORY_STATUS, OrderInventory } from '@things-factory/warehouse-base'
import { getRepository } from 'typeorm'

export const loadedInventories = {
  async loadedInventories(_: any, { releaseGoodNo }, context: any) {
    const foundRO: ReleaseGood = await getRepository(ReleaseGood).findOne({
      where: {
        domain: context.state.domain,
        name: releaseGoodNo,
        status: ORDER_STATUS.LOADING
      },
      relations: ['bizplace']
    })
    if (!foundRO) throw new Error('Release order is not found')
    const customerBizplace: Bizplace = foundRO.name

    //find orderInventory using worksheetDetails
    return await getRepository(OrderInventory).find({
      where: {
        domain: context.state.domain,
        bizplace: customerBizplace,
        releaseGood: foundRO,
        status: INVENTORY_STATUS.LOADED
      },
      relations: ['deliveryOrder', 'deliveryOrder.transportDriver', 'deliveryOrder.transportVehicle']
    })
  }
}
