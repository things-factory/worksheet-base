import {
  generateDeliveryOrder,
  OrderInventory,
  OrderNoGenerator,
  ORDER_INVENTORY_STATUS,
  ORDER_STATUS,
  ORDER_TYPES,
  ReleaseGood
} from '@things-factory/sales-base'
import { getManager, In } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { WorksheetDetail } from '../../../entities'

export const loading = {
  async loading(_: any, { loadedWorksheetDetails, releaseGoodNo, transportVehicle }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const releaseGood: ReleaseGood = await trxMgr.getRepository(ReleaseGood).findOne({
        where: { domain: context.state.domain, name: releaseGoodNo, status: ORDER_STATUS.LOADING },
        relations: ['bizplace']
      })

      const wsdNames: string[] = loadedWorksheetDetails.map((wsd: any) => wsd.name)
      const worksheetDetails: WorksheetDetail[] = await trxMgr.getRepository(WorksheetDetail).find({
        where: {
          domain: context.state.domain,
          name: In(wsdNames),
          status: WORKSHEET_STATUS.EXECUTING,
          type: WORKSHEET_TYPE.LOADING
        },
        relations: [
          'worksheet',
          'worksheet.worksheetDetails',
          'targetInventory',
          'targetInventory.domain',
          'targetInventory.bizplace',
          'targetInventory.inventory',
          'targetInventory.releaseGood'
        ]
      })
      let targetInventories: OrderInventory[] = []
      if (wsdNames.length !== worksheetDetails.length) throw new Error(`Can't find some of worksheet details`)

      for (let i = 0; i < worksheetDetails.length; i++) {
        const wsd: WorksheetDetail = worksheetDetails[i]

        const orderInventory: OrderInventory = wsd.targetInventory
        const pickedQty: number = orderInventory.releaseQty
        const loadedQty: number = loadedWorksheetDetails.find((loadedWSD: any) => loadedWSD.name === wsd.name).loadedQty

        if (loadedQty > pickedQty) {
          throw new Error(`Loaded QTY can't excced Picked QTY`)
        } else if (loadedQty == pickedQty) {
          // 1. Change status of current worksheet detail
          // 2. Change status of order inventory
          // 3. Create inventory history
          await trxMgr.getRepository(WorksheetDetail).save({
            ...wsd,
            status: WORKSHEET_STATUS.DONE,
            updater: context.state.user
          })

          const targetInventory: OrderInventory = await trxMgr.getRepository(OrderInventory).save({
            ...orderInventory,
            status: ORDER_INVENTORY_STATUS.LOADED,
            updater: context.state.user
          })

          targetInventories.push(targetInventory)
        } else if (loadedQty < pickedQty) {
          const remainQty: number = pickedQty - loadedQty
          const pickedWeight: number = orderInventory.releaseWeight
          const loadedWeight: number = parseFloat(((pickedWeight / pickedQty) * loadedQty).toFixed(2))
          const remainWeight: number = parseFloat((pickedWeight - loadedWeight).toFixed(2))

          const lastSeq: number = await trxMgr.getRepository(OrderInventory).count({
            where: { releaseGood, type: ORDER_TYPES.RELEASE_OF_GOODS }
          })

          const targetInventory: OrderInventory = await trxMgr.getRepository(OrderInventory).save({
            ...orderInventory,
            status: ORDER_INVENTORY_STATUS.LOADED,
            releaseQty: loadedQty,
            releaseWeight: loadedWeight,
            updater: context.state.user
          })

          targetInventories.push(targetInventory)

          let newOrderInventory: OrderInventory = {
            ...orderInventory,
            name: OrderNoGenerator.orderInventory(),
            status: ORDER_INVENTORY_STATUS.LOADING,
            worksheetdetail: wsd,
            releaseQty: remainQty,
            releaseWeight: remainWeight,
            seq: lastSeq + 1,
            creator: context.state.user,
            updater: context.state.user
          }
          delete newOrderInventory.id

          newOrderInventory = await trxMgr.getRepository(OrderInventory).save(newOrderInventory)
          await trxMgr.getRepository(WorksheetDetail).save({
            ...wsd,
            targetInventory: newOrderInventory,
            updater: context.state.user
          })
        }
      }

      await generateDeliveryOrder(
        null,
        transportVehicle,
        targetInventories,
        releaseGood.bizplace,
        releaseGood,
        context.state.domain,
        context.state.user,
        trxMgr
      )

      return
    })
  }
}
