import { Bizplace } from '@things-factory/biz-base'
import { OrderInventory, ORDER_INVENTORY_STATUS, ORDER_STATUS, ReleaseGood } from '@things-factory/sales-base'
import { Inventory } from '@things-factory/warehouse-base'
import { Equal, getManager, Not } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
// import { WorksheetNoGenerator } from '../../../utils/worksheet-no-generator'
// import { activateLoading } from './activate-loading'

export const completePicking = {
  async completePicking(_: any, { releaseGoodNo }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const releaseGood: ReleaseGood = await trxMgr.getRepository(ReleaseGood).findOne({
        where: { domain: context.state.domain, name: releaseGoodNo, status: ORDER_STATUS.PICKING },
        relations: ['bizplace', 'orderInventories']
      })

      if (!releaseGood) throw new Error(`Release Good doesn't exists.`)
      const customerBizplace: Bizplace = releaseGood.bizplace
      const foundPickingWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
        where: {
          domain: context.state.domain,
          bizplace: customerBizplace,
          status: WORKSHEET_STATUS.EXECUTING,
          type: WORKSHEET_TYPE.PICKING,
          releaseGood
        },
        relations: [
          'worksheetDetails',
          'worksheetDetails.targetInventory',
          'worksheetDetails.targetInventory.inventory'
        ]
      })

      if (!foundPickingWorksheet) throw new Error(`Worksheet doesn't exists.`)
      const worksheetDetails: WorksheetDetail[] = foundPickingWorksheet.worksheetDetails.map(
        (worksheetDetail: WorksheetDetail) => {
          return {
            ...worksheetDetail,
            status: WORKSHEET_STATUS.DONE,
            updater: context.state.user
          }
        }
      )
      await trxMgr.getRepository(WorksheetDetail).save(worksheetDetails)

      let targetInventories: OrderInventory[] = worksheetDetails.map(
        (worksheetDetail: WorksheetDetail) => worksheetDetail.targetInventory
      )

      // Update status of order inventories & remove locked_qty and locked_weight if it's exists
      targetInventories = await Promise.all(
        targetInventories.map(async (targetInventory: OrderInventory) => {
          const inventory: Inventory = targetInventory.inventory
          let lockedQty: number = inventory.lockedQty || 0
          let lockedWeight: number = inventory.lockedWeight || 0
          const releaseQty: number = targetInventory.releaseQty || 0
          const releaseWeight: number = targetInventory.releaseWeight || 0

          await trxMgr.getRepository(Inventory).save({
            ...inventory,
            lockedQty: lockedQty - releaseQty,
            lockedWeight: lockedWeight - releaseWeight,
            updater: context.state.user
          })

          if (releaseGood.ownTransport) {
            return {
              ...targetInventory,
              status: ORDER_INVENTORY_STATUS.TERMINATED,
              updater: context.state.user
            }
          } else {
            return {
              ...targetInventory,
              status: ORDER_INVENTORY_STATUS.PICKED,
              updater: context.state.user
            }
          }
        })
      )

      await trxMgr.getRepository(OrderInventory).save(targetInventories)

      // Update status and endedAt of worksheet
      await trxMgr.getRepository(Worksheet).save({
        ...foundPickingWorksheet,
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
        await trxMgr.getRepository(ReleaseGood).save({
          ...releaseGood,
          status: ORDER_STATUS.DONE,
          updater: context.state.user
        })
      }

      // if (relatedWorksheetCnt <= 0) {
      //   // if there no more related worksheet
      //   if (!releaseGood.ownTransport) {
      //     // 3. create loading worksheet
      //     const loadingWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).save({
      //       domain: context.state.domain,
      //       releaseGood: releaseGood,
      //       bizplace: customerBizplace,
      //       name: WorksheetNoGenerator.loading(),
      //       type: WORKSHEET_TYPE.LOADING,
      //       status: WORKSHEET_STATUS.DEACTIVATED,
      //       creator: context.state.user,
      //       updater: context.state.user
      //     })

      //     // 2) Create loading worksheet details
      //     const loadingWorksheetDetails = targetInventories.map((targetInventory: OrderInventory) => {
      //       return {
      //         domain: context.state.domain,
      //         bizplace: customerBizplace,
      //         worksheet: loadingWorksheet,
      //         name: WorksheetNoGenerator.loadingDetail(),
      //         targetInventory,
      //         type: WORKSHEET_TYPE.LOADING,
      //         status: WORKSHEET_STATUS.DEACTIVATED,
      //         creator: context.state.user,
      //         updater: context.state.user
      //       }
      //     })
      //     await trxMgr.getRepository(WorksheetDetail).save(loadingWorksheetDetails)

      //     const foundLoadingWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
      //       where: {
      //         domain: context.state.domain,
      //         releaseGood: releaseGood.id,
      //         type: WORKSHEET_TYPE.LOADING,
      //         status: WORKSHEET_STATUS.DEACTIVATED
      //       },
      //       relations: ['worksheetDetails']
      //     })

      //     await activateLoading(
      //       foundLoadingWorksheet.name,
      //       foundLoadingWorksheet.worksheetDetails,
      //       context.state.domain,
      //       context.state.user,
      //       trxMgr
      //     )

      //     // 3. update status of release good
      //     await trxMgr.getRepository(ReleaseGood).save({
      //       ...releaseGood,
      //       status: ORDER_STATUS.LOADING,
      //       updater: context.state.user
      //     })
      //   } else {
      //     // 3. update status of release good
      //     await trxMgr.getRepository(ReleaseGood).save({
      //       ...releaseGood,
      //       status: ORDER_STATUS.DONE,
      //       updater: context.state.user
      //     })
      //   }
      // }
    })
  }
}
