import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import {
  InventoryCheck,
  OrderInventory,
  OrderNoGenerator,
  ORDER_INVENTORY_STATUS,
  ORDER_STATUS
} from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory, INVENTORY_STATUS } from '@things-factory/warehouse-base'
import { WorksheetNoGenerator } from 'server/utils'
import { In } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../constants'
import { Worksheet, WorksheetDetail } from '../entities'
import { BasicInterface, WorksheetController } from './worksheet-controller'

export interface GenerateCycleCountInterface extends BasicInterface {
  cycleCountNo: string
  inventories: Inventory[]
}

export interface ActivateCycleCountInterface extends BasicInterface {
  worksheetNo: string
}

export class CycleCountWorksheetController extends WorksheetController {
  /**
   * @summary Generate Cycle Count Worksheet
   * @description
   * Create cycle count worksheet
   *  - status: DEACTIVATED
   *
   * Update inventories to lock qty & weight
   *
   * Create order inventories
   *  - status: PENDING
   *
   * Create cycle count worksheet details
   *  - status: DEACTIVATED
   *
   * @param {GenerateCycleCountInterface} worksheetInterface
   * @returns {Promise<Worksheet>}
   */
  async generateCycleCountWorksheet(worksheetInterface: GenerateCycleCountInterface): Promise<Worksheet> {
    const domain: Domain = worksheetInterface.domain
    const user: User = worksheetInterface.user

    const cycleCount: InventoryCheck = await this.findRefOrder(
      InventoryCheck,
      {
        domain,
        name: worksheetInterface.cycleCountNo,
        status: ORDER_STATUS.PENDING
      },
      ['bizplace']
    )

    const bizplace: Bizplace = cycleCount.bizplace

    const worksheet: Worksheet = await this.createWorksheet(
      domain,
      bizplace,
      cycleCount,
      WORKSHEET_TYPE.CYCLE_COUNT,
      user
    )

    let inventories: Inventory[] = worksheetInterface.inventories
    if (inventories.some((inv: Inventory) => !(inv instanceof Inventory))) {
      const palletIds: string[] = inventories.map((inv: Inventory) => inv.palletId)
      inventories = await this.trxMgr.getRepository(Inventory).find({
        where: { domain, palletId: In(palletIds), status: INVENTORY_STATUS.STORED }
      })
    }

    /* Update inventories to lock up available qty & weight */
    inventories.forEach((inv: Inventory) => {
      inv.lockedQty = inv.qty
      inv.lockedWeight = inv.weight
      inv.updater = user
    })
    inventories = await this.trxMgr.getRepository(Inventory).save(inventories)

    let targetInventories: OrderInventory[] = inventories.map((inventory: Inventory) => {
      return {
        domain,
        bizplace,
        status: ORDER_INVENTORY_STATUS.PENDING,
        name: OrderNoGenerator.orderInventory(),
        InventoryCheck: cycleCount,
        releaseQty: 0,
        releaseWeight: 0,
        inventory,
        creator: user,
        updater: user
      }
    })
    targetInventories = await this.trxMgr.getRepository(OrderInventory).save(targetInventories)

    const worksheetDetails: Partial<WorksheetDetail>[] = targetInventories.map((targetInventory: OrderInventory) => {
      return {
        domain,
        bizplace,
        worksheet,
        name: WorksheetNoGenerator.cycleCountDetail(),
        targetInventory,
        type: WORKSHEET_TYPE.CYCLE_COUNT,
        status: WORKSHEET_STATUS.DEACTIVATED,
        creator: user,
        updater: user
      } as Partial<WorksheetDetail>
    })
    await this.createWorksheetDetails(worksheetDetails)

    return worksheet
  }

  async activateCycleCount(worksheetInterface: ActivateCycleCountInterface): Promise<Worksheet> {
    const domain: Domain = worksheetInterface.domain
    const user: User = worksheetInterface.user
    const worksheetNo: string = worksheetInterface.worksheetNo
    const worksheet: Worksheet = await this.findActivatableWorksheet(domain, worksheetNo, WORKSHEET_TYPE.CYCLE_COUNT, [
      'inventoryCheck',
      'worksheetDetails',
      'worksheetDetails.targetInventory'
    ])

    const worksheetDetails: WorksheetDetail[] = worksheet.worksheetDetails
    const targetInventories: OrderInventory[] = worksheetDetails.map((wsd: WorksheetDetail) => {
      let targetInventory: OrderInventory = wsd.targetInventory
      targetInventory.status = ORDER_INVENTORY_STATUS.INSPECTING
      targetInventory.updater = user
      return targetInventory
    })

    let cycleCount: InventoryCheck = worksheet.inventoryCheck
    cycleCount.status = ORDER_STATUS.INSPECTING
    cycleCount.updater = user
    await this.updateRefOrder(InventoryCheck, cycleCount)
    await this.updateOrderTargets(OrderInventory, targetInventories)
    return await this.activateWorksheet(worksheet, worksheetDetails, [], user)
  }
}
