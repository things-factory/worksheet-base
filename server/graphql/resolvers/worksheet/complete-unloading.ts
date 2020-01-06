import { Role, User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import {
  ArrivalNotice,
  OrderInventory,
  OrderNoGenerator,
  OrderProduct,
  ORDER_PRODUCT_STATUS,
  ORDER_STATUS
} from '@things-factory/sales-base'
import { Domain, sendNotification } from '@things-factory/shell'
import { Inventory, INVENTORY_STATUS, Location } from '@things-factory/warehouse-base'
import { EntityManager, Equal, getManager, getRepository, In, Not, Repository } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { WorksheetNoGenerator } from '../../../utils/worksheet-no-generator'
import { activatePutaway } from './activate-putaway'

export const completeUnloading = {
  async completeUnloading(_: any, { arrivalNoticeNo, worksheetDetails }, context: any) {
    const updatedWorksheet: Worksheet | boolean = await getManager().transaction(
      async (trxMgr: EntityManager): Promise<Worksheet> => {
        /**
         * 1. Validation for worksheet
         *    - data existing
         */
        const arrivalNotice: ArrivalNotice = await trxMgr.getRepository(ArrivalNotice).findOne({
          where: { domain: context.state.domain, name: arrivalNoticeNo, status: ORDER_STATUS.PROCESSING },
          relations: ['bizplace']
        })

        if (!arrivalNotice) throw new Error(`ArrivalNotice doesn't exists.`)
        const customerBizplace: Bizplace = arrivalNotice.bizplace
        let foundWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
          where: {
            domain: context.state.domain,
            bizplace: customerBizplace,
            status: WORKSHEET_STATUS.EXECUTING,
            type: WORKSHEET_TYPE.UNLOADING,
            arrivalNotice
          },
          relations: ['bufferLocation', 'worksheetDetails', 'worksheetDetails.targetProduct']
        })

        if (!foundWorksheet) throw new Error(`Worksheet doesn't exists.`)
        let foundWorksheetDetails: WorksheetDetail[] = foundWorksheet.worksheetDetails
        let targetProducts: OrderProduct[] = foundWorksheetDetails.map(
          (foundWSD: WorksheetDetail) => foundWSD.targetProduct
        )

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
            updater: context.state.user
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
          updater: context.state.user
        })

        /**
         * 5. Update target products status (UNLOADED => TERMINATED)
         */
        targetProducts = targetProducts.map((targetProduct: OrderProduct) => {
          return {
            ...targetProduct,
            status: ORDER_PRODUCT_STATUS.TERMINATED,
            updater: context.state.user
          }
        })
        await trxMgr.getRepository(OrderProduct).save(targetProducts)

        /**
         * 6. Check whether every related worksheet is completed
         *    - if yes => Update Status of arrival notice
         *    - VAS doesn't affect to status of arrival notice
         */
        const relatedWorksheets: Worksheet[] = await trxMgr.getRepository(Worksheet).find({
          where: {
            domain: context.state.domain,
            bizplace: customerBizplace,
            status: Not(Equal(WORKSHEET_STATUS.DONE)),
            type: Not(In([WORKSHEET_TYPE.VAS])),
            arrivalNotice
          }
        })

        if (relatedWorksheets.length === 0) {
          await trxMgr.getRepository(ArrivalNotice).save({
            ...arrivalNotice,
            status: ORDER_STATUS.READY_TO_PUTAWAY,
            updater: context.status.user
          })
        }

        /**
         * 7. Create putaway worksheet
         */
        let inventories: Inventory[] = []
        await Promise.all(
          foundWorksheetDetails.map(async (worksheetDetail: WorksheetDetail) => {
            inventories.push(
              await trxMgr.getRepository(Inventory).find({
                where: {
                  domain: context.state.domain,
                  refOrderId: arrivalNotice.id,
                  bizplace: customerBizplace,
                  batchId: worksheetDetail.targetProduct.batchId,
                  location: foundWorksheet.bufferLocation,
                  status: INVENTORY_STATUS.UNLOADED
                },
                relations: ['product', 'warehouse', 'location']
              })
            )
          })
        )

        await createPutawayWorksheet(
          context.state.domain,
          customerBizplace,
          inventories,
          context.state.user,
          trxMgr,
          arrivalNotice,
          foundWorksheet.bufferLocation
        )

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

        return await trxMgr.getRepository(Worksheet).findOne({
          where: { id: foundWorksheet.id },
          relations: ['arrivalNotice', 'worksheetDetails']
        })
      }
    )

    /**
     * @description This function should be executed outside of above function, cause at inside of activatePutaway function, there is another trxMgr
     * and the trxMgr tries to get putawayWorksheet which is newly created. But there will be no record cause transaction not commited yet at here.
     *
     * 7.1) If there's no issue related with this worksheet => Activate putaway worksheet right directely
     */
    const issuedWorksheetDetails = worksheetDetails.filter((worksheetDetail: WorksheetDetail) => worksheetDetail.issue)
    if (issuedWorksheetDetails.length === 0) {
      const foundPutawayWorksheet: Worksheet = await getRepository(Worksheet).findOne({
        where: {
          domain: context.state.domain,
          arrivalNotice: updatedWorksheet.arrivalNotice,
          type: WORKSHEET_TYPE.PUTAWAY,
          status: WORKSHEET_STATUS.DEACTIVATED
        },
        relations: ['worksheetDetails']
      })

      await activatePutaway.activatePutaway(
        _,
        { worksheetNo: foundPutawayWorksheet.name, putawayWorksheetDetails: foundPutawayWorksheet.worksheetDetails },
        context
      )
    }
  }
}

export async function createPutawayWorksheet(
  domain: Domain,
  bizplace: Bizplace,
  inventories: Inventory[],
  user: User,
  trxMgr: EntityManager,
  arrivalNotice?: ArrivalNotice,
  bufferLocation?: Location
): Promise<Worksheet> {
  const worksheetRepo: Repository<Worksheet> = trxMgr.getRepository(Worksheet)
  const orderInvRepo: Repository<OrderInventory> = trxMgr.getRepository(OrderInventory)
  const worksheetDetailRepo: Repository<WorksheetDetail> = trxMgr.getRepository(WorksheetDetail)
  const putawayWorksheet: Worksheet = await worksheetRepo.save({
    domain,
    arrivalNotice,
    bizplace,
    name: WorksheetNoGenerator.putaway(),
    type: WORKSHEET_TYPE.PUTAWAY,
    status: WORKSHEET_STATUS.DEACTIVATED,
    bufferLocation,
    creator: user,
    updater: user
  })

  await Promise.all(
    inventories.map(async (inventory: Inventory) => {
      const targetInventory: OrderInventory = await orderInvRepo.save({
        name: OrderNoGenerator.orderInventory(),
        seq: inventory.lastSeq,
        releaseQty: inventory.qty,
        status: ORDER_PRODUCT_STATUS.UNLOADED,
        arrivalNotice,
        inventory,
        creator: user,
        updater: user
      })

      await worksheetDetailRepo.save({
        domain,
        bizplace,
        name: WorksheetNoGenerator.putawayDetail(),
        type: WORKSHEET_TYPE.PUTAWAY,
        worksheet: putawayWorksheet,
        targetInventory,
        fromLocation: bufferLocation,
        status: WORKSHEET_STATUS.DEACTIVATED,
        creator: user,
        updater: user
      })
    })
  )

  return putawayWorksheet
}
