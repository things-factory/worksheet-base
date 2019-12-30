import { ORDER_STATUS, ReleaseGood, DeliveryOrder, OrderInventory } from '@things-factory/sales-base'
import { INVENTORY_STATUS, Inventory } from '@things-factory/warehouse-base'
import { Bizplace } from '@things-factory/biz-base'
import { getRepository, In } from 'typeorm'
import { WorksheetDetail } from '../../../entities'

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
    const customerBizplace: Bizplace = foundRO.bizplace

    const foundDO: DeliveryOrder = await getRepository(DeliveryOrder).findOne({
      where: {
        domain: context.state.domain,
        releaseGood: foundRO,
        transportDriver: transportDriver,
        transportVehicle: transportVehicle,
        status: ORDER_STATUS.PENDING
      },
      relations: ['transportDriver', 'transportVehicle']
    })
    if (!foundDO) throw new Error('Delivery order is not found')

    //find orderInventory
    const targetInventories: OrderInventory[] = await getRepository(OrderInventory).find({
      where: {
        domain: context.state.domain,
        bizplace: customerBizplace,
        releaseGood: foundRO,
        deliveryOrder: foundDO,
        status: INVENTORY_STATUS.LOADED
      },
      relations: ['inventory', 'inventory.product']
    })

    const worksheetDetails: WorksheetDetail[] = await getRepository(WorksheetDetail).find({
      where: {
        domain: context.state.domain,
        bizplace: customerBizplace,
        targetInventory: In(targetInventories)
      },
      relations: ['targetInventory', 'targetInventory.inventory']
    })

    return {
      deliveryInfo: worksheetDetails.map(async (loadingWSD: WorksheetDetail) => {
        const targetInventory: OrderInventory = loadingWSD.targetInventory
        const inventory: Inventory = targetInventory.inventory
        return {
          palletId: inventory.palletId,
          batchId: inventory.batchId,
          product: inventory.product,
          truckNo: foundDO.transportVehicle.name,
          driver: foundDO.transportDriver.name
        }
      })
    }
  }
}
