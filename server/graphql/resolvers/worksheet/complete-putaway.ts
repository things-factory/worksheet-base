import { Bizplace } from '@things-factory/biz-base'
import { ArrivalNotice, OrderInventory, ORDER_PRODUCT_STATUS, ORDER_STATUS } from '@things-factory/sales-base'
import { sendNotification } from '@things-factory/shell'
import { Inventory, Location, LOCATION_STATUS } from '@things-factory/warehouse-base'
import { generateGoodsReceivalNote } from '@things-factory/sales-base'
import { Equal, getManager, In, Not } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const completePutaway = {
  async completePutaway(_: any, { arrivalNoticeNo }, context: any) {
    return await getManager().transaction(async trxMgr => {
      /**
       * 1. Validation for worksheet
       *    - data existing
       */
      const arrivalNotice: ArrivalNotice = await trxMgr.getRepository(ArrivalNotice).findOne({
        // Because of partial unloading current status of arrivalNotice can be PUTTING_AWAY or PROCESSING
        // PUTTING_AWAY means unloading is completely finished.
        // PROCESSING means some products are still being unloaded.
        where: {
          domain: context.state.domain,
          name: arrivalNoticeNo,
          status: In([ORDER_STATUS.PUTTING_AWAY, ORDER_STATUS.PROCESSING])
        },
        relations: ['bizplace']
      })

      if (!arrivalNotice) throw new Error(`ArrivalNotice doesn't exists.`)
      const customerBizplace: Bizplace = arrivalNotice.bizplace

      // Check whether unloading is done or not.
      const unloadingWorksheetCnt: number = await trxMgr.getRepository(Worksheet).count({
        where: {
          domain: context.state.domain,
          bizplace: customerBizplace,
          arrivalNotice,
          type: WORKSHEET_TYPE.UNLOADING,
          status: WORKSHEET_STATUS.EXECUTING
        }
      })

      if (unloadingWorksheetCnt) throw new Error(`Unloading is not completed yet`)

      const foundPutawayWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
        where: {
          domain: context.state.domain,
          bizplace: customerBizplace,
          status: WORKSHEET_STATUS.EXECUTING,
          type: WORKSHEET_TYPE.PUTAWAY,
          arrivalNotice
        },
        relations: [
          'worksheetDetails',
          'worksheetDetails.targetInventory',
          'worksheetDetails.targetInventory.inventory',
          'bufferLocation',
          'bizplace'
        ]
      })

      if (!foundPutawayWorksheet) throw new Error(`Worksheet doesn't exists.`)
      const bufferLocation: Location = foundPutawayWorksheet.bufferLocation
      const relatedInventory: Inventory = await trxMgr.getRepository(Inventory).findOne({
        where: { domain: context.state.domain, location: bufferLocation }
      })

      if (!relatedInventory) {
        trxMgr.getRepository(Location).save({
          ...bufferLocation,
          status: LOCATION_STATUS.EMPTY,
          updater: context.state.user
        })
      }

      await trxMgr.getRepository(Worksheet).save({
        ...foundPutawayWorksheet,
        status: WORKSHEET_STATUS.DONE,
        endedAt: new Date(),
        updater: context.state.user
      })

      const worksheetDetails: WorksheetDetail[] = foundPutawayWorksheet.worksheetDetails.map(
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
      targetInventories = targetInventories.map((orderInventory: OrderInventory) => {
        return {
          ...orderInventory,
          status: ORDER_PRODUCT_STATUS.TERMINATED,
          updater: context.state.user
        }
      })

      let inventories: Inventory[] = worksheetDetails.map(
        (worksheetDetail: WorksheetDetail) => worksheetDetail.targetInventory.inventory
      )
      inventories = inventories.map((inventory: Inventory) => {
        return {
          ...inventory,
          lockedQty: 0,
          updater: context.state.user
        }
      })
      await trxMgr.getRepository(Inventory).save(inventories)

      // 2. If there's no more worksheet related with current arrival notice
      // update status of arrival notice
      // 2. 1) check wheter there are more worksheet or not
      const relatedWorksheets: Worksheet[] = await trxMgr.getRepository(Worksheet).find({
        domain: context.state.domain,
        arrivalNotice,
        status: Not(Equal(WORKSHEET_STATUS.DONE))
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
          title: `Putaway has been completed`,
          message: `${arrivalNoticeNo} is done`,
          url: context.header.referer
        }
        users.forEach(user => {
          sendNotification({
            receiver: user.id,
            message: JSON.stringify(msg)
          })
        })
      }

      if (!relatedWorksheets || (relatedWorksheets && relatedWorksheets.length === 0)) {
        // 3. update status of arrival notice
        await trxMgr.getRepository(ArrivalNotice).save({
          ...arrivalNotice,
          status: ORDER_STATUS.DONE,
          updater: context.state.user
        })
      }

      /**
       * 4. Generate the Goods Received Note straight away
       */
      await generateGoodsReceivalNote(
        { refNo: arrivalNotice.name, customer: foundPutawayWorksheet.bizplace.id },
        context.state.domain,
        context.state.user,
        trxMgr
      )
    })
  }
}
