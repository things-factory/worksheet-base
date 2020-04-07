import { Role } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import { sendNotification } from '@things-factory/shell'
import { getManager, In } from 'typeorm'
import {
  ORDER_INVENTORY_STATUS,
  ORDER_STATUS,
  ORDER_VAS_STATUS,
  OrderInventory,
  DeliveryOrder,
  OrderVas,
  ReleaseGood,
} from '@things-factory/sales-base'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const pendingCancellationReleaseOrder = {
  async pendingCancellationReleaseOrder(_: any, { name }, context: any) {
    return await getManager().transaction(async (trxMgr) => {
      const foundRO: ReleaseGood = await trxMgr.getRepository(ReleaseGood).findOne({
        where: { domain: context.state.domain, name },
        relations: ['bizplace', 'orderInventories', 'orderVass'],
      })

      if (!foundRO) throw new Error(`Release good order doesn't exists.`)
      let targetOIs: OrderInventory[] = foundRO.orderInventories
      let foundOVs: OrderVas[] = foundRO.orderVass
      let customerBizplace: Bizplace = foundRO.bizplace

      // 1. Check RO status
      if (foundRO.status === ORDER_STATUS.DONE || foundRO.status === ORDER_STATUS.LOADING) {
        // 1a. Case 1: RO is done or loading, pending cancel order, worksheet, worksheet detail, order inventory
        // update status of order inventory to PENDING_CANCEL
        targetOIs = targetOIs.map((orderInv: OrderInventory) => {
          return {
            ...orderInv,
            status: ORDER_INVENTORY_STATUS.PENDING_REVERSE,
            updater: context.state.user,
          }
        })
        await trxMgr.getRepository(OrderInventory).save(targetOIs)
      } else if (foundRO.status === ORDER_STATUS.PICKING || foundRO.status === ORDER_STATUS.READY_TO_PICK) {
        const pickingOIs: OrderInventory[] = targetOIs
          .filter(
            (oi: OrderInventory) =>
              oi.status === ORDER_INVENTORY_STATUS.PICKING ||
              oi.status === ORDER_INVENTORY_STATUS.READY_TO_PICK ||
              oi.status === ORDER_INVENTORY_STATUS.PENDING_SPLIT
          )
          .map((targetOI: OrderInventory) => {
            return {
              ...targetOI,
              status: ORDER_INVENTORY_STATUS.PENDING_CANCEL,
              updater: context.state.user,
            }
          })
        await trxMgr.getRepository(OrderInventory).save(pickingOIs)

        const pickedOIs: OrderInventory[] = targetOIs
          .filter((pickedOI: OrderInventory) => pickedOI.status === ORDER_INVENTORY_STATUS.PICKED)
          .map((targetOI: OrderInventory) => {
            return {
              ...targetOI,
              status: ORDER_INVENTORY_STATUS.PENDING_REVERSE,
              updater: context.state.user,
            }
          })
        await trxMgr.getRepository(OrderInventory).save(pickedOIs)
      }

      // update status of order vass to PENDING_CANCEL
      if (foundOVs && foundOVs.length) {
        foundOVs = foundOVs.map((orderVas: OrderVas) => {
          return {
            ...orderVas,
            status: ORDER_VAS_STATUS.PENDING_CANCEL,
            updater: context.state.user,
          }
        })
        await trxMgr.getRepository(OrderVas).save(foundOVs)
      }

      // find worksheet and update status to PENDING_CANCEL
      let foundWS: Worksheet[] = await trxMgr.getRepository(Worksheet).find({
        where: {
          domain: context.state.domain,
          releaseGood: foundRO,
        },
      })

      foundWS = foundWS.map((ws: Worksheet) => {
        return {
          ...ws,
          status: ORDER_INVENTORY_STATUS.PENDING_CANCEL,
          updater: context.state.user,
        }
      })
      await trxMgr.getRepository(Worksheet).save(foundWS)

      // find worksheet detail and update status to PENDING_CANCEL
      let foundWSD: WorksheetDetail[] = await trxMgr.getRepository(WorksheetDetail).find({
        where: {
          domain: context.state.domain,
          targetInventory: In(targetOIs.map((oi: OrderInventory) => oi.id)),
        },
      })

      foundWSD = foundWSD.map((wsd: WorksheetDetail) => {
        return {
          ...wsd,
          status: ORDER_INVENTORY_STATUS.PENDING_CANCEL,
          updater: context.state.user,
        }
      })
      await trxMgr.getRepository(WorksheetDetail).save(foundWSD)

      // find DO and change status to pending cancel
      let foundDO: DeliveryOrder[] = await trxMgr.getRepository(DeliveryOrder).find({
        where: { domain: context.state.domain, releaseGood: foundRO },
      })

      foundDO = foundDO.map((deliveryOrder: DeliveryOrder) => {
        return {
          ...deliveryOrder,
          status: ORDER_STATUS.PENDING_CANCEL,
          updater: context.state.user,
        }
      })
      await trxMgr.getRepository(DeliveryOrder).save(foundDO)

      await trxMgr.getRepository(ReleaseGood).save({
        ...foundRO,
        status: ORDER_STATUS.PENDING_CANCEL,
        updater: context.state.user,
      })

      // notification logics
      // get Office Admin Users
      const users: any[] = await trxMgr
        .getRepository('users_roles')
        .createQueryBuilder('ur')
        .select('ur.users_id', 'id')
        .where((qb) => {
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
          title: `${foundRO.name} cancellation`,
          message: `${customerBizplace.name} is requesting to cancel order`,
          url: context.header.referer,
        }
        users.forEach((user) => {
          sendNotification({
            receiver: user.id,
            message: JSON.stringify(msg),
          })
        })
      }

      return
    })
  },
}
