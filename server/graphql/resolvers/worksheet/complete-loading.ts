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
import { Inventory } from '@things-factory/warehouse-base'
import { EntityManager, getManager, getRepository, Repository } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { WorksheetNoGenerator } from '../../../utils/worksheet-no-generator'
// import { activateReturn } from './activate-return'

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
      const orderInventories: OrderInventory[] = loadedInventories.map((targetInventory: OrderInventory) => {
        const inventory: Inventory = targetInventory.inventory
        let lockedQty: number = inventory.lockedQty || 0
        let lockedWeight: number = inventory.lockedWeight || 0
        const releaseQty: number = targetInventory.releaseQty || 0
        const releaseWeight: number = targetInventory.releaseWeight || 0

        trxMgr.getRepository(Inventory).save({
          ...inventory,
          lockedQty: lockedQty - releaseQty,
          lockedWeight: lockedWeight - releaseWeight,
          updater: context.state.user
        })

        return {
          ...targetInventory,
          status: ORDER_INVENTORY_STATUS.TERMINATED,
          updater: context.state.user
        }
      })
      await trxMgr.getRepository(OrderInventory).save(orderInventories)

      // generate putaway worksheet with remain order inventories
      if (remainInventories?.length) {
        // Update status of remained order inventories
        remainInventories.map(async (targetInventory: OrderInventory) => {
          const inventory: Inventory = targetInventory.inventory
          let lockedQty: number = inventory.lockedQty || 0
          let lockedWeight: number = inventory.lockedWeight || 0
          const releaseQty: number = targetInventory.releaseQty || 0
          const releaseWeight: number = targetInventory.releaseWeight || 0

          await trxMgr.getRepository(Inventory).save({
            ...inventory,
            lockedQty: lockedQty - releaseQty,
            lockedWeight: lockedWeight - releaseWeight,
            updater: context.state.user
          })
        })

        const inventories: Inventory[] = remainInventories.map((orderInv: OrderInventory) => orderInv.inventory)
        await createReturnWorksheet(
          context.state.domain,
          customerBizplace,
          releaseGood,
          inventories,
          context.state.user,
          trxMgr
        )

        await trxMgr.getRepository(ReleaseGood).save({
          ...releaseGood,
          status: ORDER_STATUS.PARTIAL_RETURN,
          updater: context.state.user
        })
      } else {
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
  inventories: Inventory,
  user: User,
  trxMgr?: EntityManager
): Promise<void> {
  const worksheetRepo: Repository<Worksheet> = trxMgr ? trxMgr.getRepository(Worksheet) : getRepository(Worksheet)
  const worksheetDetailRepo: Repository<WorksheetDetail> = trxMgr
    ? trxMgr.getRepository(WorksheetDetail)
    : getRepository(WorksheetDetail)
  const orderInventoryRepo: Repository<OrderInventory> = trxMgr
    ? trxMgr.getRepository(OrderInventory)
    : getRepository(OrderInventory)

  // create return worksheet
  const returnWorksheet: Worksheet = await worksheetRepo.save({
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
    inventories.map(async (inventory: Inventory) => {
      //find the order inventory for return
      let targetInventory: OrderInventory = await orderInventoryRepo.findOne({
        where: { domain, inventory, releaseGood, bizplace: customerBizplace, status: ORDER_INVENTORY_STATUS.LOADING }
      })

      //update the order inventory to RETURNING status
      targetInventory = await orderInventoryRepo.save({
        ...targetInventory,
        status: ORDER_INVENTORY_STATUS.RETURNING,
        updater: user
      })

      // create new worksheetdetail for return process
      await worksheetDetailRepo.save({
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

  // TODO: activate return worksheet
  // const foundReturnWorksheet: Worksheet = await worksheetRepo.findOne({
  //   where: {
  //     domain,
  //     releaseGood,
  //     type: WORKSHEET_TYPE.LOADING,
  //     status: WORKSHEET_STATUS.DEACTIVATED
  //   },
  //   relations: ['worksheetDetails']
  // })
  // await activateReturn(foundReturnWorksheet.name, foundReturnWorksheet.worksheetDetails, domain, user, trxMgr)
}
