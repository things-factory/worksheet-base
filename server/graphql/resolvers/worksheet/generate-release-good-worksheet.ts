import { User } from '@things-factory/auth-base'
import { Bizplace, getPermittedBizplaceIds } from '@things-factory/biz-base'
import {
  OrderInventory,
  OrderVas,
  ORDER_INVENTORY_STATUS,
  ORDER_STATUS,
  ORDER_VAS_STATUS,
  ReleaseGood
} from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory } from '@things-factory/warehouse-base'
import { EntityManager, getManager, In } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { WorksheetNoGenerator } from '../../../utils'

export const generateReleaseGoodWorksheetResolver = {
  async generateReleaseGoodWorksheet(_: any, { releaseGoodNo }, context: any) {
    return await getManager().transaction(async trxMgr => {
      return await generateReleaseGoodWorksheet(trxMgr, releaseGoodNo, context)
    })
  }
}

export async function generateReleaseGoodWorksheet(
  trxMgr: EntityManager,
  releaseGoodNo: string,
  context: any
): Promise<{
  pickingWorksheet: Worksheet
  vasWorksheet: Worksheet
}> {
  const { domain, user } = context.state

  let foundReleaseGood: ReleaseGood = await trxMgr.getRepository(ReleaseGood).findOne({
    where: {
      domain,
      name: releaseGoodNo,
      bizplace: In(await getPermittedBizplaceIds(context.state.domain, context.state.user)),
      status: ORDER_STATUS.PENDING_RECEIVE
    },
    relations: ['bizplace', 'orderInventories', 'orderInventories.inventory', 'orderVass']
  })

  if (!foundReleaseGood) throw new Error(`Release good doesn't exsits.`)
  const customerBizplace: Bizplace = foundReleaseGood.bizplace
  let foundOIs: OrderInventory[] = foundReleaseGood.orderInventories
  let foundOVs: OrderVas[] = foundReleaseGood.orderVass

  /*
   * 2. Create worksheet and worksheet details for inventories
   */
  // 2. 1) Create picking worksheet
  const pickingWorksheet = await trxMgr.getRepository(Worksheet).save({
    domain,
    bizplace: customerBizplace,
    name: WorksheetNoGenerator.picking(),
    releaseGood: foundReleaseGood,
    type: WORKSHEET_TYPE.PICKING,
    status: WORKSHEET_STATUS.DEACTIVATED,
    creator: user,
    updater: user
  })

  // order inventories is assigned when customer request pick by pallet
  if (foundOIs.every((oi: OrderInventory) => oi?.inventory?.id) || foundReleaseGood.crossDocking) {
    // 2. 2) Create picking worksheet details

    for (let oi of foundOIs) {
      await generatePickingWorksheetDetail(trxMgr, domain, customerBizplace, user, pickingWorksheet, oi)
    }

    if (foundReleaseGood.crossDocking) {
      foundOIs.map(async (oi: OrderInventory) => {
        if (oi.inventory?.id) {
          oi.inventory.lockedQty = oi.releaseQty
          oi.inventory.lockedWeight = oi.releaseWeight
          oi.inventory.updater = user
          await trxMgr.getRepository(Inventory).save(oi.inventory)
        }
      })
    }
  }

  // 2. 2) Update status of order inventories (PENDING_RECEIVE => PENDING_SPLIT or READY_TO_PICK)
  // If order inventory was created by cross docking or already has assigned inventory
  // status will be READY_TO_PICK because the inventory will be assigned  dynamically
  // else if there's no assigned inventory status should be PENDING_SPLIT
  foundOIs = foundOIs.map((oi: OrderInventory) => {
    let status: string = ORDER_INVENTORY_STATUS.PENDING_SPLIT
    if (oi.crossDocking || oi.inventory?.id) {
      status = ORDER_INVENTORY_STATUS.READY_TO_PICK
    }

    oi.status = status
    oi.updater = user
    return oi
  })
  await trxMgr.getRepository(OrderInventory).save(foundOIs)

  /**
   * 3. Create worksheet and worksheet details for vass (if it exists)
   */
  let vasWorksheet: Worksheet = new Worksheet()
  if (foundOVs && foundOVs.length) {
    // 3. 1) Create vas worksheet
    vasWorksheet = await trxMgr.getRepository(Worksheet).save({
      domain,
      bizplace: customerBizplace,
      name: WorksheetNoGenerator.vas(),
      releaseGood: foundReleaseGood,
      type: WORKSHEET_TYPE.VAS,
      status: WORKSHEET_STATUS.DEACTIVATED,
      creator: user,
      updater: user
    })

    // 3. 2) Create vas worksheet details
    const vasWorksheetDetails = foundOVs.map((ov: OrderVas) => {
      return {
        domain,
        bizplace: customerBizplace,
        worksheet: vasWorksheet,
        name: WorksheetNoGenerator.vasDetail(),
        targetVas: ov,
        type: WORKSHEET_TYPE.VAS,
        status: WORKSHEET_STATUS.DEACTIVATED,
        creator: user,
        updater: user
      }
    })
    await trxMgr.getRepository(WorksheetDetail).save(vasWorksheetDetails)

    // 3. 3) Update status of order vas (PENDING_RECEIVE => READY_TO_PROCESS)
    foundOVs = foundOVs.map((ov: OrderVas) => {
      ov.status = ORDER_VAS_STATUS.READY_TO_PROCESS
      ov.updater = user
      return ov
    })
    await trxMgr.getRepository(OrderVas).save(foundOVs)
  }

  /**
   * 5. Update status of release good (PENDING_RECEIVE => READY_TO_PICK)
   */
  foundReleaseGood.status = ORDER_STATUS.READY_TO_PICK
  foundReleaseGood.updater = user
  foundReleaseGood.acceptedBy = user
  await trxMgr.getRepository(ReleaseGood).save(foundReleaseGood)

  /**
   * 6. Returning worksheet as a result
   */
  return {
    pickingWorksheet,
    vasWorksheet
  }
}

/**
 * @description This function will generate picking worksheet detail
 * If you call this function without specified status, status will be set as DEACTIVATED
 *
 * @param {EntityManager} trxMgr
 * @param {Domain} domain
 * @param {Bizplace} bizplace
 * @param {User} user
 * @param {Worksheet} worksheet
 * @param {OrderInventory} targetInventory
 * @param {String} status
 */
export async function generatePickingWorksheetDetail(
  trxMgr: EntityManager,
  domain: Domain,
  bizplace: Bizplace,
  user: User,
  worksheet: Worksheet,
  targetInventory: OrderInventory,
  status: string = WORKSHEET_STATUS.DEACTIVATED
): Promise<WorksheetDetail> {
  if (!WORKSHEET_STATUS.hasOwnProperty(status)) throw new Error('Passed status is not a candidate of available status')

  let pickingWSD: WorksheetDetail = new WorksheetDetail()
  pickingWSD.domain = domain
  pickingWSD.bizplace = bizplace
  pickingWSD.worksheet = worksheet
  pickingWSD.name = WorksheetNoGenerator.pickingDetail()
  pickingWSD.targetInventory = targetInventory
  pickingWSD.type = WORKSHEET_TYPE.PICKING
  pickingWSD.status = status
  pickingWSD.creator = user
  pickingWSD.updater = user

  return await trxMgr.getRepository(WorksheetDetail).save(pickingWSD)
}
