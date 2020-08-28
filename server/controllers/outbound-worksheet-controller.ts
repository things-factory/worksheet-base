import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import { OrderInventory, OrderVas, ORDER_INVENTORY_STATUS, ORDER_STATUS, ReleaseGood } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory } from '@things-factory/warehouse-base'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../constants'
import { Worksheet, WorksheetDetail } from '../entities'
import { WorksheetNoGenerator } from '../utils'
import { GenerateVasInterface, VasWorksheetController } from './vas-worksheet-controller'
import { BasicInterface } from './worksheet-controller'

export interface GeneratePickingInterface extends BasicInterface {
  releaseGoodNo: string
}

export interface GenerateLoadingInterface extends BasicInterface {}

export interface ActivatePickingInterface extends BasicInterface {
  worksheetNo: string
}

export interface ActivateLoadingInterface extends BasicInterface {
  worksheetNo: string
}

export class OutboundWorksheetController extends VasWorksheetController {
  /**
   * @summary Generate Picking Worksheet
   * @description
   * Create picking worksheet
   *  - status: DEACTIVATED
   *
   * Create picking worksheet details
   *  - status: DEACTIVATED
   *
   * Update status of orderInventories
   *  - status: PENDING_RECEIVE => READY_TO_PICK
   *
   * Call generateVasWorksheet function if it's needed
   *
   * Update status of release good
   *  - status: PENDING_RECEIVE => READY_TO_UNLOAD
   * @param {GenerateUnloadingInterface} worksheetInterface
   * @returns {Promise<Worksheet>}
   */
  async generatePickingWorksheet(worksheetInterface: GeneratePickingInterface): Promise<Worksheet> {
    const domain: Domain = worksheetInterface.domain
    const user: User = worksheetInterface.user
    let releaseGood: ReleaseGood = await this.findRefOrder(
      ReleaseGood,
      {
        domain,
        name: worksheetInterface.releaseGoodNo,
        status: ORDER_STATUS.PENDING_RECEIVE
      },
      ['bizplace', 'orderInventories', 'orderInventories.inventory', 'orderVass']
    )
    const bizplace: Bizplace = releaseGood.bizplace
    const orderInventories: OrderInventory[] = releaseGood.orderInventories
    const orderVASs: OrderVas[] = releaseGood.orderVass

    const worksheet: Worksheet = await this.createWorksheet(domain, bizplace, releaseGood, WORKSHEET_TYPE.PICKING, user)

    if (orderInventories.every((oi: OrderInventory) => oi.inventory?.id) || releaseGood.crossDocking) {
      const worksheetDetails: Partial<WorksheetDetail>[] = orderInventories.map((targetInventory: OrderInventory) => {
        return {
          domain,
          bizplace,
          worksheet,
          name: WorksheetNoGenerator.pickingDetail(),
          targetInventory,
          type: WORKSHEET_TYPE.PICKING,
          status: WORKSHEET_STATUS.DEACTIVATED,
          creator: user,
          updater: user
        } as Partial<WorksheetDetail>
      })
      await this.createWorksheetDetails(worksheetDetails)

      const inventories: Inventory[] = orderInventories.map((oi: OrderInventory) => {
        let inventory: Inventory = oi.inventory
        inventory.lockedQty = oi.releaseQty
        inventory.lockedWeight = oi.releaseWeight
        inventory.updater = user
      })

      await this.trxMgr.getRepository(Inventory).save(inventories)
    }

    orderInventories.forEach((oi: OrderInventory) => {
      oi.status =
        oi.crossDocking || oi.inventory?.id
          ? ORDER_INVENTORY_STATUS.READY_TO_PICK
          : ORDER_INVENTORY_STATUS.PENDING_SPLIT
      oi.updater = user
    })
    await this.updateOrderTargets(OrderInventory, orderInventories)

    if (orderVASs?.length > 0) {
      await this.generateVasWorksheet({
        domain,
        user,
        referenceOrder: releaseGood
      } as GenerateVasInterface)
    }

    releaseGood.status = ORDER_STATUS.READY_TO_PICK
    releaseGood.updater = user
    await this.updateRefOrder(ReleaseGood, releaseGood)

    return worksheet
  }

  async generateLoadingWorksheet(worksheetInterface: GenerateLoadingInterface): Promise<Worksheet> {
    return
  }

  async activatePicking(worksheetInterface: ActivatePickingInterface): Promise<Worksheet> {
    const domain: Domain = worksheetInterface.domain
    const user: User = worksheetInterface.user
    const worksheetNo: string = worksheetInterface.worksheetNo

    let worksheet: Worksheet = await this.findWorksheetByNo(domain, worksheetNo, [
      'releaseGood',
      'worksheetDetails',
      'worksheetDestails.targetInventory'
    ])
    this.checkWorksheetValidity(worksheet, { type: WORKSHEET_TYPE, status: WORKSHEET_STATUS.DEACTIVATED })
    const worksheetDestails: WorksheetDetail[] = worksheet.worksheetDetails

    const targetInventories: OrderInventory[] = worksheetDestails.map((wsd: WorksheetDetail) => {
      let targetInventory: OrderInventory = wsd.targetInventory
      targetInventory.status = ORDER_INVENTORY_STATUS.PICKING
      targetInventory.updater = user
      return targetInventory
    })
    this.updateOrderTargets(OrderInventory, targetInventories)

    let releaseGood: ReleaseGood = worksheet.releaseGood
    ;(releaseGood.status = ORDER_STATUS.PICKING), (releaseGood.updater = user)
    this.updateRefOrder(ReleaseGood, releaseGood)

    worksheet = await this.activateWorksheet(worksheet, worksheetDestails, [], user)

    const vasWorksheet: Worksheet = await this.findWorksheetByRefOrder(domain, releaseGood, WORKSHEET_TYPE.VAS)
    if (vasWorksheet) {
      await this.activateVAS({ domain, user, worksheetNo: vasWorksheet.name })
    }

    const pendingSplitOIs: OrderInventory[] = await this.trxMgr.getRepository(OrderInventory).find({
      where: { domain, releaseGood, status: ORDER_INVENTORY_STATUS.PENDING_SPLIT }
    })
    if (pendingSplitOIs?.length) {
      const ids: string[] = pendingSplitOIs.map((oi: OrderInventory) => oi.id)
      await this.trxMgr.getRepository(OrderInventory).delete(ids)
    }

    return worksheet
  }

  async activateLoading(worksheetInterface: ActivateLoadingInterface): Promise<Worksheet> {
    return
  }
}
