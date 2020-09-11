import { Bizplace } from '@things-factory/biz-base'
import { OrderInventory, ORDER_INVENTORY_STATUS, ORDER_STATUS, ReleaseGood } from '@things-factory/sales-base'
import { sendNotification } from '@things-factory/shell'
import { getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { WorksheetNoGenerator } from '../../../utils'
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
      const worksheetDetails: WorksheetDetail[] = foundPickingWorksheet.worksheetDetails
      const targetInventories: OrderInventory[] = worksheetDetails.map((wsd: WorksheetDetail) => wsd.targetInventory)

      // filter out replaced inventory
      const pickedtargetInv: OrderInventory[] = targetInventories.filter(
        (targetInv: OrderInventory) => targetInv.status === ORDER_INVENTORY_STATUS.PICKED
      )

      // Update status and endedAt of worksheet
      await trxMgr.getRepository(Worksheet).save({
        ...foundPickingWorksheet,
        status: WORKSHEET_STATUS.DONE,
        endedAt: new Date(),
        updater: context.state.user
      })

      // Find Existing Loading Worksheet if any
      let existLoadingWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
        where: {
          releaseGood,
          type: WORKSHEET_TYPE.LOADING,
          status: WORKSHEET_STATUS.DEACTIVATED
        }
      })

      // 3. create loading worksheet
      const loadingWorksheet: Worksheet = existLoadingWorksheet
        ? existLoadingWorksheet
        : await trxMgr.getRepository(Worksheet).save({
            domain: context.state.domain,
            releaseGood,
            bizplace: customerBizplace,
            name: WorksheetNoGenerator.loading(),
            type: WORKSHEET_TYPE.LOADING,
            status: WORKSHEET_STATUS.DEACTIVATED,
            creator: context.state.user,
            updater: context.state.user
          })

      // 2) Create loading worksheet details
      let loadingWorksheetDetails = await Promise.all(
        pickedtargetInv.map(async (targetInventory: OrderInventory) => {
          let existingLoadingWorksheetDetail: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
            where: {
              domain: context.state.domain,
              worksheet: loadingWorksheet,
              targetInventory,
              type: WORKSHEET_TYPE.LOADING
            }
          })

          return existingLoadingWorksheetDetail
            ? {
                ...existingLoadingWorksheetDetail,
                status: WORKSHEET_STATUS.DEACTIVATED
              }
            : {
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
      )

      loadingWorksheetDetails = await trxMgr.getRepository(WorksheetDetail).save(loadingWorksheetDetails)

      await activateLoading(
        loadingWorksheet.name,
        loadingWorksheetDetails,
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
    })
  }
}
