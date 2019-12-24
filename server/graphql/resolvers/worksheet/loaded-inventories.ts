import { ORDER_STATUS, Bizplace, ReleaseGood, DeliveryOrder } from '@things-factory/sales-base'
import { INVENTORY_STATUS, OrderInventory } from '@things-factory/warehouse-base'
import { getRepository } from 'typeorm'

export const loadedInventories = {
  async loadedInventories(_: any, { releaseGoodNo, transportDriver, transportVehicle }, context: any) {
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

    const foundDO: DeliveryOrder = await getRepository(DeliveryOrder).findOne({
      where: {
        domain: context.state.domain,
        releaseGood: foundRO,
        transportDriver: transportDriver,
        transportVehicle: transportVehicle,
        status: ORDER_STATUS.PENDING
      }
    })
    if (!foundDO) throw new Error('Delivery order is not found')

    //find orderInventory
    return await getRepository(OrderInventory).find({
      where: {
        domain: context.state.domain,
        bizplace: customerBizplace,
        releaseGood: foundRO,
        deliveryOrder: foundDO,
        status: INVENTORY_STATUS.LOADED
      },
      relations: ['deliveryOrder', 'deliveryOrder.transportDriver', 'deliveryOrder.transportVehicle']
    })
  }
}
