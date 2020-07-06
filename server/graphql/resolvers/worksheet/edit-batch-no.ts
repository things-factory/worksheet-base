import { Role } from '@things-factory/auth-base'
import { ArrivalNotice, OrderProduct, ORDER_PRODUCT_STATUS } from '@things-factory/sales-base'
import { sendNotification } from '@things-factory/shell'
import { getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const editBatchNo = {
  async editBatchNo(_: any, { worksheetNo, unloadingWorksheetDetails }, context: any) {
    return await getManager().transaction(async trxMgr => {
      /**
       * 1. Validation for worksheet
       *    - data existing
       *    - status of worksheet
       */
      const foundWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
        where: {
          domain: context.state.domain,
          name: worksheetNo,
          type: WORKSHEET_TYPE.UNLOADING,
          status: WORKSHEET_STATUS.DEACTIVATED
        },
        relations: ['bizplace', 'arrivalNotice', 'worksheetDetails', 'worksheetDetails.targetProduct']
      })

      if (!foundWorksheet) throw new Error(`Worksheet doesn't exists`)
      const foundGAN: ArrivalNotice = foundWorksheet.arrivalNotice
      const foundWSDs: WorksheetDetail[] = foundWorksheet.worksheetDetails
      let targetProducts: OrderProduct[] = foundWSDs.map((foundWSD: WorksheetDetail) => {
        return {
          ...foundWSD.targetProduct,
          palletQty: foundWSD.targetProduct.palletQty
            ? foundWSD.targetProduct.palletQty
            : unloadingWorksheetDetails.find(
                (worksheetDetail: WorksheetDetail) => worksheetDetail.name === foundWSD.name
              ).palletQty,
          adjustedBatchId: unloadingWorksheetDetails.find(
            (worksheetDetail: WorksheetDetail) => worksheetDetail.name === foundWSD.name
          ).batchId,
          status:
            unloadingWorksheetDetails.find((worksheetDetail: WorksheetDetail) => worksheetDetail.name === foundWSD.name)
              .initialBatchId ===
            unloadingWorksheetDetails.find((worksheetDetail: WorksheetDetail) => worksheetDetail.name === foundWSD.name)
              .batchId
              ? ORDER_PRODUCT_STATUS.READY_TO_UNLOAD
              : ORDER_PRODUCT_STATUS.PENDING_APPROVAL
        }
      })
      await trxMgr.getRepository(OrderProduct).save(targetProducts)

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
            .andWhere('role.domain_id = :domain', { domain: context.state.domain.id })
            .getQuery()
          return 'ur.roles_id IN ' + subQuery
        })
        .getRawMany()

      // send notification to Office Admin Users
      if (users?.length) {
        const msg = {
          title: `Pending Adjustment for ${foundGAN.name}`,
          message: `Pending process for batch id adjustments`,
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
       * 5. Update Worksheet (status: DEACTIVATED => EXECUTING)
       */
      return await trxMgr.getRepository(Worksheet).save({
        ...foundWorksheet,
        status: WORKSHEET_STATUS.PENDING_ADJUSTMENT,
        updater: context.state.user
      })
    })
  }
}
