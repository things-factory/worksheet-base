import { Bizplace } from '@things-factory/biz-base'
import {
  OrderInventory,
  ORDER_INVENTORY_STATUS,
  ORDER_STATUS,
  ORDER_TYPES,
  ReleaseGood
} from '@things-factory/sales-base'
import { Equal, getManager, Not } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet } from '../../../entities'
import { createPutawayWorksheet } from './complete-unloading'
import { Inventory } from '@things-factory/warehouse-base'

export const completeLoading = {
  async completeLoading(_: any, { releaseGoodNo }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const releaseGood: ReleaseGood = await trxMgr.getRepository(ReleaseGood).findOne({
        where: { domain: context.state.domain, name: releaseGoodNo, status: ORDER_STATUS.LOADING },
        relations: ['bizplace', 'orderInventories']
      })

      if (!releaseGood) throw new Error(`Release Good doesn't exists.`)
      const customerBizplace: Bizplace = releaseGood.bizplace
      const foundLoadingWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
        where: {
          domain: context.state.domain,
          bizplace: customerBizplace,
          status: WORKSHEET_STATUS.EXECUTING,
          type: WORKSHEET_TYPE.LOADING,
          releaseGood
        }
      })

      if (!foundLoadingWorksheet) throw new Error(`Worksheet doesn't exists.`)
      let targetInventories: OrderInventory[] = await trxMgr.getRepository(OrderInventory).find({
        where: { releaseGood, type: ORDER_TYPES.RELEASE_OF_GOODS },
        relations: ['inventory']
      })

      // Update status of order inventories & remove locked_qty and locked_weight if it's exists
      let {
        loadedInventories,
        remainInventories
      }: { loadedInventories: OrderInventory[]; remainInventories: OrderInventory[] } = targetInventories.reduce(
        (obj, orderInv: OrderInventory) => {
          if (orderInv.status === ORDER_INVENTORY_STATUS.LOADED) {
            obj.loadedInventories.push(orderInv)
          } else {
            obj.remainInventories.push(orderInv)
          }
          return obj
        },
        {
          loadedInventories: [],
          remainInventories: []
        }
      )

      // generate putaway worksheet with remain order inventories
      if (remainInventories?.length) {
        const inventories: Inventory[] = remainInventories.map((orderInv: OrderInventory) => orderInv.Inventory)
        await createPutawayWorksheet(context.state.domain, customerBizplace, inventories, context.state.user, trxMgr)
      }

      // Update status of loaded order inventories
      await trxMgr.getRepository(OrderInventory).save(
        loadedInventories.map((targetInventory: OrderInventory) => {
          return {
            ...targetInventory,
            status: ORDER_INVENTORY_STATUS.TERMINATED,
            updater: context.state.user
          }
        })
      )

      // Update status and endedAt of worksheet
      await trxMgr.getRepository(Worksheet).save({
        ...foundLoadingWorksheet,
        status: WORKSHEET_STATUS.DONE,
        endedAt: new Date(),
        updater: context.state.user
      })

      // 2. If there's no more worksheet related with current release good, update status of release good
      // 2. 1) check wheter there are more worksheet or not
      const relatedWorksheetCnt: number = await trxMgr.getRepository(Worksheet).count({
        domain: context.state.domain,
        releaseGood,
        status: Not(Equal(WORKSHEET_STATUS.DONE))
      })

      if (relatedWorksheetCnt <= 0) {
        // 3. update status of release good
        await trxMgr.getRepository(ReleaseGood).save({
          ...releaseGood,
          status: ORDER_STATUS.DONE,
          updater: context.state.user
        })
      }
    })
  }
}
