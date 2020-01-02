import { OrderInventory, ORDER_STATUS, ReleaseGood, DeliveryOrder } from '@things-factory/sales-base'
import { TransportDriver, TransportVehicle } from '@things-factory/transport-base'
import { Inventory } from '@things-factory/warehouse-base'
import { getRepository, In } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'

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

    return await getRepository(OrderInventory).find({
      where: {
        deliveryOrder: In(deliveryOrders.map((deliveryOrder: DeliveryOrder) => deliveryOrder.id))
      },
      relations: [
        'inventory',
        'product',
        'deliveryOrder',
        'deliveryOrder.transportDriver',
        'deliveryOrder.transportVehicle'
      ]
    })
  }
}
