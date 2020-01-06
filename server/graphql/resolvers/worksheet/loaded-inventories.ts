import { DeliveryOrder, OrderInventory, ORDER_STATUS, ReleaseGood } from '@things-factory/sales-base'
import { getRepository, In } from 'typeorm'

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

    const deliveryOrders: DeliveryOrder[] = await getRepository(DeliveryOrder).find({
      where: { releaseGood: foundRO }
    })

    if (deliveryOrders?.length) {
      return await getRepository(OrderInventory).find({
        where: {
          deliveryOrder: In(deliveryOrders.map((deliveryOrder: DeliveryOrder) => deliveryOrder.id))
        },
        relations: [
          'inventory',
          'inventory.product',
          'deliveryOrder',
          'deliveryOrder.transportDriver',
          'deliveryOrder.transportVehicle'
        ]
      })
    } else {
      return []
    }
  }
}
