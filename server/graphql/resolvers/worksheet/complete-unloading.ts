import { Role, User } from '@things-factory/auth-base'
import {
  ArrivalNotice,
  generateGoodsReceivalNote,
  OrderProduct,
  ORDER_PRODUCT_STATUS,
  ORDER_STATUS
} from '@things-factory/sales-base'
import { Domain, sendNotification } from '@things-factory/shell'
import { Inventory, INVENTORY_STATUS } from '@things-factory/warehouse-base'
import { EntityManager, Equal, getManager, In, Not } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { activatePutaway } from './activate-putaway'
import { generatePutawayWorksheet } from './generate-putaway-worksheet'

export const completeUnloading = {
  async completeUnloading(_: any, { arrivalNoticeNo, worksheetDetails }, context: any) {
    return await getManager().transaction(async (trxMgr: EntityManager) => {
      /**
       * 1. Validation for worksheet
       *    - data existing
       */
      const domain: Domain = context.state.domain
      const user: User = context.state.user
      let arrivalNotice: ArrivalNotice = await trxMgr.getRepository(ArrivalNotice).findOne({
        where: { domain, name: arrivalNoticeNo, status: ORDER_STATUS.PROCESSING },
        relations: ['bizplace', 'orderProducts']
      })

      if (!arrivalNotice) throw new Error(`ArrivalNotice doesn't exists.`)

      if(arrivalNotice.crossDocking) {
        // Picking worksheet for cross docking should be completed before complete it
        // Find picking worksheet
        const executingPickingWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
          where: { domain, releaseGood: arrivalNotice.releaseGood, type: WORKSHEET_TYPE.PICKING, status: Not(Equal(WORKSHEET_STATUS.DONE))}
        })
        if(executingPickingWorksheet) throw new Error(`Picking should be completed before complete unloading for cross docking.`)
      }

      /**
       * 2. Validation for non-approved order products
       *    - If there's non approved order product (status: READY_TO_APPROVED)
       *      throw Error.
       */
      if (arrivalNotice.orderProducts.some((op: OrderProduct) => op.status === ORDER_PRODUCT_STATUS.READY_TO_APPROVED))
        throw new Error(`There's non-approved order products`)
      const bizplace = arrivalNotice.bizplace
      let foundWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
        where: {
          domain,
          bizplace,
          status: WORKSHEET_STATUS.EXECUTING,
          type: WORKSHEET_TYPE.UNLOADING,
          arrivalNotice
        },
        relations: ['bizplace', 'bufferLocation', 'worksheetDetails', 'worksheetDetails.targetProduct']
      })

      if (!foundWorksheet) throw new Error(`Worksheet doesn't exists.`)
      let foundWorksheetDetails: WorksheetDetail[] = foundWorksheet.worksheetDetails
      let targetProducts: OrderProduct[] = foundWorksheetDetails.map(
        (foundWSD: WorksheetDetail) => foundWSD.targetProduct
      )

      /**
       * Validation for partial unloaded pallets
       * If there are partially unloaded pallets throw Error
       */
      const partiallyUnloadedCnt: number = await trxMgr.getRepository(Inventory).count({
        where: {
          domain,
          refOrderId: arrivalNotice.id,
          bizplace,
          status: INVENTORY_STATUS.PARTIALLY_UNLOADED
        }
      })

      if (partiallyUnloadedCnt)
        throw new Error('There is partially unloaded pallet, generate putaway worksheet before complete unloading.')

      /**
       * 3. Update worksheet detail status (EXECUTING => DONE) & issue note
       */
      foundWorksheetDetails = foundWorksheetDetails.map((foundWSD: WorksheetDetail) => {
        const worksheetDetail: WorksheetDetail = worksheetDetails.find(
          (worksheetDetail: WorksheetDetail) => foundWSD.name === worksheetDetail.name
        )
        if (worksheetDetail && worksheetDetail.issue) foundWSD.issue = worksheetDetail.issue
        return {
          ...foundWSD,
          status: WORKSHEET_STATUS.DONE,
          updater: user
        }
      })
      await trxMgr.getRepository(WorksheetDetail).save(foundWorksheetDetails)

      /**
       * 4. Update worksheet status (status: EXECUTING => DONE)
       */
      foundWorksheet = await trxMgr.getRepository(Worksheet).save({
        ...foundWorksheet,
        status: WORKSHEET_STATUS.DONE,
        endedAt: new Date(),
        updater: user
      })

      /**
       * 5. Update target products status (UNLOADED => TERMINATED)
       */
      targetProducts = targetProducts.map((targetProduct: OrderProduct) => {
        return {
          ...targetProduct,
          status: ORDER_PRODUCT_STATUS.TERMINATED,
          updater: user
        }
      })
      await trxMgr.getRepository(OrderProduct).save(targetProducts)

      /**
       * 6. Check whether every related worksheet is completed
       *    - if yes => Update Status of arrival notice
       *    - VAS doesn't affect to status of arrival notice
       *    - Except putaway worksheet because putaway worksheet can be exist before complete unloading by partial unloading
       */
      const relatedWorksheets: Worksheet[] = await trxMgr.getRepository(Worksheet).find({
        where: {
          domain,
          bizplace,
          status: Not(Equal(WORKSHEET_STATUS.DONE)),
          type: Not(In([WORKSHEET_TYPE.VAS, WORKSHEET_TYPE.PUTAWAY])),
          arrivalNotice
        }
      })

      // If there's no related order && if status of arrival notice is not indicating putaway process
      if (relatedWorksheets.length === 0 && arrivalNotice.status !== ORDER_STATUS.PUTTING_AWAY) {
        await trxMgr.getRepository(ArrivalNotice).save({
          ...arrivalNotice,
          status: ORDER_STATUS.READY_TO_PUTAWAY,
          updater: user
        })
      }

      const inventories: Inventory[] = await trxMgr.getRepository(Inventory).find({
        where: {
          domain,
          refOrderId: arrivalNotice.id,
          bizplace,
          status: INVENTORY_STATUS.UNLOADED
        }
      })

      const putawayWorksheet: Worksheet = await generatePutawayWorksheet(
        domain,
        arrivalNotice,
        inventories,
        user,
        trxMgr
      )

      // Activate it if putaway worksheet is deactivated
      if (putawayWorksheet.status === WORKSHEET_STATUS.DEACTIVATED) {
        await activatePutaway(putawayWorksheet.name, putawayWorksheet.worksheetDetails, domain, user, trxMgr)
      }

      // Update status of arrival notice to PUTTING_AWAY
      arrivalNotice = await trxMgr.getRepository(ArrivalNotice).findOne({ where: { domain, id: arrivalNotice.id } })
      arrivalNotice.status = ORDER_STATUS.PUTTING_AWAY
      arrivalNotice.updater = user
      await trxMgr.getRepository(ArrivalNotice).save(arrivalNotice)

      // notification logics
      // get Office Admin Users
      const users: any[] = await trxMgr
        .getRepository('users_roles')
        .createQueryBuilder('ur')
        .select('ur.users_id', 'id')
        .where(qb => {
          const subQuery = qb
            .subQuery()
            .select('role.id')
            .from(Role, 'role')
            .where("role.name = 'Office Admin'")
            .andWhere('role.domain_id = :domain', { domain: domain.id })
            .getQuery()
          return 'ur.roles_id IN ' + subQuery
        })
        .getRawMany()

      // send notification to Office Admin Users
      if (users?.length) {
        const msg = {
          title: `Unloading Completed`,
          message: `${arrivalNoticeNo} is ready for putaway`,
          url: context.header.referer
        }
        users.forEach(user => {
          sendNotification({
            receiver: user.id,
            message: JSON.stringify(msg)
          })
        })
      }

      /**
       * 6. Generate the Goods Received Note straight away
       */
      await generateGoodsReceivalNote(
        { refNo: arrivalNotice.name, customer: foundWorksheet.bizplace.id },
        domain,
        user,
        trxMgr
      )
    })
  }
}
