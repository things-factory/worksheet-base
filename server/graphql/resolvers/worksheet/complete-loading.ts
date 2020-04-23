import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import {
  OrderInventory,
  ORDER_INVENTORY_STATUS,
  ORDER_STATUS,
  ORDER_TYPES,
  ReleaseGood
} from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager, getRepository, Repository } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { WorksheetNoGenerator } from '../../../utils'

export const completeLoading = {
  async completeLoading(_: any, { releaseGoodNo }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const releaseGood: ReleaseGood = await trxMgr.getRepository(ReleaseGood).findOne({
        where: { domain: context.state.domain, name: releaseGoodNo, status: ORDER_STATUS.LOADING },
        relations: ['bizplace', 'orderInventories']
      })

      if (!releaseGood) throw new Error(`Release Good doesn't exists.`)
      const customerBizplace: Bizplace = releaseGood.bizplace
      const foundLoadingWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
        where: {
          domain: context.state.domain,
          bizplace: customerBizplace,
          status: WORKSHEET_STATUS.EXECUTING,
          type: WORKSHEET_TYPE.LOADING,
          releaseGood
        },
        relations: ['worksheetDetails']
      })

      if (!foundLoadingWorksheet) throw new Error(`Worksheet doesn't exists.`)

      let targetInventories: OrderInventory[] = await trxMgr.getRepository(OrderInventory).find({
        where: { releaseGood, type: ORDER_TYPES.RELEASE_OF_GOODS },
        relations: ['inventory']
      })

      // Update status of order inventories & remove locked_qty and locked_weight if it's exists
      let { loadedInventories, remainInventories } = targetInventories.reduce(
        (obj, orderInv: OrderInventory) => {
          if (orderInv.status === ORDER_INVENTORY_STATUS.LOADED) {
            obj.loadedInventories.push(orderInv)
          } else if (orderInv.status === ORDER_INVENTORY_STATUS.LOADING) {
            obj.remainInventories.push(orderInv)
          }
          return obj
        },
        {
          loadedInventories: [],
          remainInventories: []
        }
      )

      // Update status of loaded order inventories
      loadedInventories = loadedInventories.map((targetInventory: OrderInventory) => {
        return {
          ...targetInventory,
          status: ORDER_INVENTORY_STATUS.TERMINATED,
          updater: context.state.user
        }
      })
      await trxMgr.getRepository(OrderInventory).save(loadedInventories)

      // generate putaway worksheet with remain order inventories
      if (remainInventories?.length) {
        await createReturnWorksheet(
          context.state.domain,
          customerBizplace,
          releaseGood,
          remainInventories,
          context.state.user,
          trxMgr
        )

        await trxMgr.getRepository(ReleaseGood).save({
          ...releaseGood,
          status: ORDER_STATUS.PARTIAL_RETURN,
          updater: context.state.user
        })
      } else {
        // Check whether there are related worksheet or not
        // If there no more order which is related with current release order
        // Update status to DONE

        await trxMgr.getRepository(ReleaseGood).save({
          ...releaseGood,
          status: ORDER_STATUS.DONE,
          updater: context.state.user
        })
      }

      // Update status and endedAt of worksheet
      await trxMgr.getRepository(Worksheet).save({
        ...foundLoadingWorksheet,
        status: WORKSHEET_STATUS.DONE,
        endedAt: new Date(),
        updater: context.state.user
      })
    })
  }
}

// Generating worksheet for returning process
export async function createReturnWorksheet(
  domain: Domain,
  customerBizplace: Bizplace,
  releaseGood: ReleaseGood,
  orderInvs: OrderInventory[],
  user: User,
  trxMgr?: EntityManager
): Promise<void> {
  const wsRepo: Repository<Worksheet> = trxMgr?.getRepository(Worksheet) || getRepository(Worksheet)
  const wsdRepo: Repository<WorksheetDetail> = trxMgr?.getRepository(WorksheetDetail) || getRepository(WorksheetDetail)
  const orderInvRepo: Repository<OrderInventory> =
    trxMgr?.getRepository(OrderInventory) || getRepository(OrderInventory)

  // create return worksheet
  const returnWorksheet: Worksheet = await wsRepo.save({
    domain,
    releaseGood,
    bizplace: customerBizplace,
    name: WorksheetNoGenerator.return(),
    type: WORKSHEET_TYPE.RETURN,
    status: WORKSHEET_STATUS.DEACTIVATED,
    creator: user,
    updater: user
  })

  await Promise.all(
    orderInvs.map(async (targetInventory: OrderInventory) => {
      targetInventory = await orderInvRepo.save({
        ...targetInventory,
        status: ORDER_INVENTORY_STATUS.RETURNING,
        updater: user
      })

      // create new worksheetdetail for return process
      await wsdRepo.save({
        domain,
        bizplace: customerBizplace,
        name: WorksheetNoGenerator.returnDetail(),
        type: WORKSHEET_TYPE.RETURN,
        worksheet: returnWorksheet,
        targetInventory,
        status: WORKSHEET_STATUS.DEACTIVATED,
        creator: user,
        updater: user
      })
    })
  )
}
