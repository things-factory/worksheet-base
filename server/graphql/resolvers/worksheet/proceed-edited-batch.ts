import { Role } from '@things-factory/auth-base'
import { Bizplace, getMyBizplace } from '@things-factory/biz-base'
import { ArrivalNotice, OrderProduct, OrderVas, ORDER_PRODUCT_STATUS, ORDER_STATUS } from '@things-factory/sales-base'
import { sendNotification } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE, TARGET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const proceedEditedBatchResolver = {
  async proceedEditedBatch(_: any, { ganNo, approvedProducts, rejectedProducts }, context: any): Promise<void> {
    return await getManager().transaction(async (trxMgr: EntityManager) => {
      // Validation
      // Check status of GAN
      const customerBizplace: Bizplace = await getMyBizplace(context.state.user)
      const arrivalNotice: ArrivalNotice = await trxMgr.getRepository(ArrivalNotice).findOne({
        where: {
          domain: context.state.domain,
          bizplace: customerBizplace,
          name: ganNo
        },
        relations: ['orderProducts', 'orderProducts.product', 'orderVass', 'orderVass.targetProduct']
      })

      let foundOVs: OrderVas[] = arrivalNotice.orderVass
      let foundOPs: OrderProduct[] = arrivalNotice.orderProducts

      if (arrivalNotice.status !== ORDER_STATUS.PENDING_APPROVAL)
        throw new Error(`Status (${arrivalNotice.status}) of GAN is not available to proceed extra products.`)

      // Validation
      // Check numbers of target products
      // (approvedProducts + rejectedProducts = target order products)
      const targetProdCnt: number = arrivalNotice.orderProducts.filter(
        (op: OrderProduct) => op.status === ORDER_PRODUCT_STATUS.PENDING_APPROVAL
      ).length
      if (approvedProducts.length + rejectedProducts.length != targetProdCnt)
        throw new Error(`Invalid numbers of approved batch no`)

      // Create worksheet details with approved order products
      let unloadingWS: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
        where: {
          domain: context.state.domain,
          arrivalNotice,
          type: WORKSHEET_TYPE.UNLOADING,
          status: WORKSHEET_STATUS.PENDING_APPROVAL
        },
        relations: ['worksheetDetails']
      })

      if (approvedProducts?.length) {
        approvedProducts = await Promise.all(
          approvedProducts.map(async (approvedProd: OrderProduct) => {
            return {
              ...approvedProd,
              remark: `Previous Batch No - ${approvedProd.batchId}, has been adjusted into ${approvedProd.adjustedBatchId}`,
              batchId: approvedProd.adjustedBatchId,
              status: ORDER_PRODUCT_STATUS.READY_TO_UNLOAD,
              updater: context.state.user
            }
          })
        )
        await trxMgr.getRepository(OrderProduct).save(approvedProducts)
      }

      if (foundOVs?.length) {
        foundOVs = await Promise.all(
          foundOVs.map(async (ov: OrderVas) => {
            if (ov.targetType === TARGET_TYPE.BATCH_NO) {
              const foundOP: OrderProduct = foundOPs.find((op: OrderProduct) => op.batchId === ov.targetBatchId)
              return {
                ...ov,
                targetBatchId: foundOP.adjustedBatchId,
                updater: context.state.user
              }
            } else if (ov.targetType === TARGET_TYPE.BATCH_AND_PRODUCT_TYPE) {
              const foundOP: OrderProduct = foundOPs.find(
                (op: OrderProduct) => op.batchId === ov.targetBatchId && op.product.name === ov.targetProduct.name
              )

              return {
                ...ov,
                targetBatchId: foundOP.adjustedBatchId,
                updater: context.state.user
              }
            }
          })
        )

        await trxMgr.getRepository(OrderVas).save(foundOVs)
      }

      if (rejectedProducts?.length) {
        rejectedProducts = await Promise.all(
          rejectedProducts.map(async (rejectedProd: OrderProduct) => {
            return {
              ...rejectedProd,
              remark: `New adjustment batch no - ${rejectedProd.adjustedBatchId}, has been rejected`,
              status: ORDER_PRODUCT_STATUS.READY_TO_UNLOAD,
              updater: context.state.user
            }
          })
        )
        await trxMgr.getRepository(OrderProduct).save(rejectedProducts)
      }

      let worksheetDetails: WorksheetDetail[] = unloadingWS.worksheetDetails
      worksheetDetails.forEach((worksheetDetail: WorksheetDetail) => {
        worksheetDetail.status = WORKSHEET_STATUS.DEACTIVATED
      })
      await trxMgr.getRepository(WorksheetDetail).save(worksheetDetails)

      await trxMgr.getRepository(Worksheet).save({
        ...unloadingWS,
        status: WORKSHEET_STATUS.DEACTIVATED,
        updater: context.state.user
      })

      await trxMgr.getRepository(ArrivalNotice).save({
        ...arrivalNotice,
        status: ORDER_STATUS.READY_TO_UNLOAD,
        updater: context.state.user
      })

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
          title: `Edited batch no approved/rejected by ${customerBizplace.name}`,
          message: `Newly approved batch no is ready to be unloaded.`,
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
