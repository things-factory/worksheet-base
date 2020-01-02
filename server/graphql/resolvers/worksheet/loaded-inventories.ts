import { OrderInventory, ORDER_STATUS, ReleaseGood } from '@things-factory/sales-base'
import { TransportDriver, TransportVehicle } from '@things-factory/transport-base'
import { Inventory } from '@things-factory/warehouse-base'
import { getRepository } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'

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

    const foundWorksheet: Worksheet = await getRepository(Worksheet).findOne({
      where: {
        domain: context.state.domain,
        releaseGood: releaseGoodNo,
        status: WORKSHEET_STATUS.EXECUTING,
        type: WORKSHEET_TYPE.LOADING
      }
    })

    const worksheetDetails: WorksheetDetail[] = await getRepository(WorksheetDetail).find({
      where: {
        domain: context.state.domain,
        worksheet: foundWorksheet,
        status: WORKSHEET_STATUS.DONE,
        type: WORKSHEET_TYPE.LOADING
      },
      relations: ['targetInventory', 'targetInventory.inventory', 'targetInventory.inventory.product']
    })

    const foundTruck: TransportVehicle = await getRepository(TransportVehicle).findOne({
      where: { domain: context.state.domain, id: transportVehicle }
    })

    const foundDriver: TransportDriver = await getRepository(TransportDriver).findOne({
      where: { domain: context.state.domain, id: transportDriver }
    })

    return {
      deliveryInfo: worksheetDetails.map(async (loadingWSD: WorksheetDetail) => {
        const targetInventory: OrderInventory = loadingWSD.targetInventory
        const inventory: Inventory = targetInventory.inventory
        return {
          palletId: inventory.palletId,
          batchId: inventory.batchId,
          product: inventory.product,
          truckNo: foundTruck.name,
          driver: foundDriver.name
        }
      })
    }
  }
}
