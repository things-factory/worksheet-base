import { Role, User } from '@things-factory/auth-base'
import {
  ArrivalNotice,
  generateGoodsReceivalNote,
  OrderProduct,
  OrderInventory,
  ORDER_PRODUCT_STATUS,
  ORDER_INVENTORY_STATUS,
  ORDER_STATUS,
  ORDER_TYPES
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
        relations: ['bizplace', 'orderProducts', 'releaseGood']
      })

      if (!arrivalNotice) throw new Error(`ArrivalNotice doesn't exists.`)

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
        relations: ['bizplace', 'bufferLocation', 'worksheetDetails', 'worksheetDetails.targetProduct', 'worksheetDetails.targetProduct.product']
      })

      if (!foundWorksheet) throw new Error(`Worksheet doesn't exists.`)
      let allPicked = []
      let foundWorksheetDetails: WorksheetDetail[] = foundWorksheet.worksheetDetails
      let targetProducts: OrderProduct[] = foundWorksheetDetails.map(
        (foundWSD: WorksheetDetail) => foundWSD.targetProduct
      )

      /** CROSS DOCKING **
       * If the cross docking item is not yet picked, need to finish picking first
       * If the picking is done and released all inbound items, putaway worksheet will not be generated
       *    - find the picking worksheet that is done
       *    - get all order inventories item
       *    - need to total up the qty and weight 
       *    - compare product_id, batch_no, packing_type, release_qty and release_weight of order inventories with order products
       *    - check worksheet_details for picking if it is terminated
       */

      if (arrivalNotice.crossDocking) {
        const donePickingWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
          where: { domain, releaseGood: arrivalNotice.releaseGood, type: WORKSHEET_TYPE.PICKING, status: Equal(WORKSHEET_STATUS.DONE) },
          relations: ['bizplace', 'worksheetDetails', 'worksheetDetails.targetInventory', 'worksheetDetails.targetInventory.product']
        })

        if (donePickingWorksheet) {
          const donePickingWSD: WorksheetDetail[] = donePickingWorksheet.worksheetDetails
          const targetInventories: OrderInventory[] = donePickingWSD.map(
            (doneWSD: WorksheetDetail) => doneWSD.targetInventory
          )
          
          targetProducts.forEach((targetProduct: OrderProduct) => {
            targetInventories.forEach((targetInventory: OrderInventory) => {
              if (
                // since release order in cross docking will only release by product,
                // we can use these parameters to check
                targetInventory.product.id === targetProduct.product.id &&
                targetInventory.packingType === targetProduct.packingType &&
                targetInventory.batchId === targetProduct.batchId
              ) {
                if (
                  targetInventory.releaseQty === targetProduct.actualPackQty &&
                  targetInventory.releaseWeight === (targetProduct.actualPackQty * targetProduct.weight)
                )
                  allPicked.push(true)
                else
                  allPicked.push(false)
              }
            })
          })
        }
        // throw error if the picking worksheet is still executing
        else throw new Error(`Picking should be completed before complete unloading for cross docking.`)

      }

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
        if (worksheetDetail && worksheetDetail.issue) {
          foundWSD.issue = worksheetDetail.issue
        
          targetProducts = targetProducts.map((targetProduct: OrderProduct) => {
            if (foundWSD.targetProduct.id === targetProduct.id) {
              return {
                ...targetProduct,
                remark: foundWSD.issue
              }
            } else {
              return {
                ...targetProduct
              }
            }
          })
        }

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

      let arrivalNoticeStatus

      // if there is unpicked item, need to generate putaway worksheet
      if (allPicked.length == 0 || allPicked.includes(false)) {
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
        arrivalNoticeStatus = ORDER_STATUS.PUTTING_AWAY

      }
      else {
        // since there's no putaway worksheet is generated, then need to generate GRN
        await generateGoodsReceivalNote(
          { refNo: arrivalNotice.name, customer: arrivalNotice.bizplace.id },
          context.state.domain,
          context.state.user,
          trxMgr
        )

        arrivalNoticeStatus = ORDER_STATUS.DONE
      }
      
      // Update status of arrival notice 
      arrivalNotice = await trxMgr.getRepository(ArrivalNotice).findOne({ where: { domain, id: arrivalNotice.id } })
      arrivalNotice.status = arrivalNoticeStatus
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
    })
  }
}
