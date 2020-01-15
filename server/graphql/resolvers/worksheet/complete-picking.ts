import { Bizplace } from '@things-factory/biz-base'
import { OrderInventory, ORDER_INVENTORY_STATUS, ORDER_STATUS, ReleaseGood } from '@things-factory/sales-base'
import { sendNotification } from '@things-factory/shell'
import { Equal, getManager, Not } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { WorksheetNoGenerator } from '../../../utils/worksheet-no-generator'
import { activateLoading } from './activate-loading'

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
          return {
            ...targetInventory,
            status: ORDER_INVENTORY_STATUS.PICKED,
            updater: context.state.user
          }
        })
      )

      await trxMgr.getRepository(OrderInventory).save(targetInventories)

      // notification logics
      // get Customer Users
      const users: any[] = await trxMgr
        .getRepository('bizplaces_users')
        .createQueryBuilder('bu')
        .select('bu.user_id', 'id')
        .where(qb => {
          const subQuery = qb
            .subQuery()
            .select('bizplace.id')
            .from(Bizplace, 'bizplace')
            .where('bizplace.name = :bizplaceName', { bizplaceName: customerBizplace.name })
            .getQuery()
          return 'bu.bizplace_id IN ' + subQuery
        })
        .getRawMany()

      // send notification to Customer Users
      if (users?.length) {
        const msg = {
          title: `Picking has been completed`,
          message: `Items now are ready to be loaded`,
          url: context.header.referer
        }
        users.forEach(user => {
          sendNotification({
            receiver: user.id,
            message: JSON.stringify(msg)
          })
        })
      }

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
        // 3. create loading worksheet
        const loadingWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).save({
          domain: context.state.domain,
          releaseGood: releaseGood,
          bizplace: customerBizplace,
          name: WorksheetNoGenerator.loading(),
          type: WORKSHEET_TYPE.LOADING,
          status: WORKSHEET_STATUS.DEACTIVATED,
          creator: context.state.user,
          updater: context.state.user
        })

        // 2) Create loading worksheet details
        const loadingWorksheetDetails = targetInventories.map((targetInventory: OrderInventory) => {
          return {
            domain: context.state.domain,
            bizplace: customerBizplace,
            worksheet: loadingWorksheet,
            name: WorksheetNoGenerator.loadingDetail(),
            targetInventory,
            type: WORKSHEET_TYPE.LOADING,
            status: WORKSHEET_STATUS.DEACTIVATED,
            creator: context.state.user,
            updater: context.state.user
          }
        })
        await trxMgr.getRepository(WorksheetDetail).save(loadingWorksheetDetails)

        const foundLoadingWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
          where: {
            domain: context.state.domain,
            releaseGood: releaseGood.id,
            type: WORKSHEET_TYPE.LOADING,
            status: WORKSHEET_STATUS.DEACTIVATED
          },
          relations: ['worksheetDetails']
        })

        await activateLoading(
          foundLoadingWorksheet.name,
          foundLoadingWorksheet.worksheetDetails,
          context.state.domain,
          context.state.user,
          trxMgr
        )

        // 3. update status of release good
        await trxMgr.getRepository(ReleaseGood).save({
          ...releaseGood,
          status: ORDER_STATUS.LOADING,
          updater: context.state.user
        })
      }
    })
  }
}
