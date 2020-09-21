import { Bizplace } from '@things-factory/biz-base'
import {
  InventoryCheck,
  OrderInventory,
  OrderNoGenerator,
  ORDER_INVENTORY_STATUS,
  ORDER_STATUS
} from '@things-factory/sales-base'
import { Inventory, INVENTORY_STATUS, Location } from '@things-factory/warehouse-base'
import { Equal, In, Not } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../constants'
import { Worksheet, WorksheetDetail } from '../../entities'
import { WorksheetController } from '../worksheet-controller'

export class CycleCountWorksheetController extends WorksheetController {
  async generateCycleCountWorksheet(cycleCountNo: string, inventories: Inventory[]): Promise<Worksheet> {
    const cycleCount: InventoryCheck = await this.findRefOrder(
      InventoryCheck,
      {
        domain: this.domain,
        name: cycleCountNo,
        status: ORDER_STATUS.PENDING
      },
      ['bizplace']
    )

    const bizplace: Bizplace = cycleCount.bizplace

    if (inventories.some((inv: Inventory) => !(inv instanceof Inventory))) {
      const palletIds: string[] = inventories.map((inv: Inventory) => inv.palletId)
      inventories = await this.trxMgr.getRepository(Inventory).find({
        where: { domain: this.domain, palletId: In(palletIds), status: INVENTORY_STATUS.STORED }
      })
    }

    /* Update inventories to lock up available qty & weight */
    inventories.forEach((inv: Inventory) => {
      inv.lockedQty = inv.qty
      inv.lockedWeight = inv.weight
      inv.updater = this.user
    })
    inventories = await this.trxMgr.getRepository(Inventory).save(inventories)

    let targetInventories: OrderInventory[] = inventories.map((inventory: Inventory) => {
      let targetInventory: Partial<OrderInventory> = new OrderInventory()
      targetInventory.domain = this.domain
      targetInventory.bizplace = bizplace
      targetInventory.status = ORDER_INVENTORY_STATUS.PENDING
      targetInventory.name = OrderNoGenerator.orderInventory()
      targetInventory.inventoryCheck = cycleCount
      targetInventory.releaseQty = 0
      targetInventory.releaseWeight = 0
      targetInventory.inventory = inventory
      targetInventory.creator = this.user
      targetInventory.updater = this.user
      return targetInventory
    })
    targetInventories = await this.trxMgr.getRepository(OrderInventory).save(targetInventories)

    return await this.generateWorksheet(
      WORKSHEET_TYPE.CYCLE_COUNT,
      cycleCount,
      targetInventories,
      cycleCount.status,
      ORDER_INVENTORY_STATUS.PENDING
    )
  }

  async activateCycleCount(worksheetNo: string): Promise<Worksheet> {
    const worksheet: Worksheet = await this.findActivatableWorksheet(worksheetNo, WORKSHEET_TYPE.CYCLE_COUNT, [
      'inventoryCheck',
      'worksheetDetails',
      'worksheetDetails.targetInventory'
    ])

    const worksheetDetails: WorksheetDetail[] = worksheet.worksheetDetails
    const targetInventories: OrderInventory[] = worksheetDetails.map((wsd: WorksheetDetail) => {
      let targetInventory: OrderInventory = wsd.targetInventory
      targetInventory.status = ORDER_INVENTORY_STATUS.INSPECTING
      targetInventory.updater = this.user
      return targetInventory
    })

    let cycleCount: InventoryCheck = worksheet.inventoryCheck
    cycleCount.status = ORDER_STATUS.INSPECTING
    cycleCount.updater = this.user
    await this.updateRefOrder(cycleCount)
    await this.updateOrderTargets(targetInventories)
    return await this.activateWorksheet(worksheet, worksheetDetails, [])
  }

  async inspecting(
    worksheetDetailName: string,
    palletId: string,
    locationName: string,
    inspectedQty: number
  ): Promise<void> {
    let worksheetDetail: WorksheetDetail = await this.findExecutableWorksheetDetailByName(
      worksheetDetailName,
      WORKSHEET_TYPE.CYCLE_COUNT,
      ['targetInventory', 'targetInventory.inventory', 'targetInventory.inventory.location']
    )

    let targetInventory: OrderInventory = worksheetDetail.targetInventory
    let inventory: Inventory = targetInventory.inventory
    const beforeLocation: Location = inventory.location
    const currentLocation: Location = await this.trxMgr.getRepository(Location).findOne({
      where: { domain: this.domain, name: locationName }
    })
    if (!currentLocation) throw new Error(this.ERROR_MSG.FIND.NO_RESULT(locationName))

    if (inventory.palletId !== palletId)
      throw new Error(this.ERROR_MSG.VALIDITY.CANT_PROCEED_STEP_BY('inspect', 'pallet ID is invalid'))

    if (beforeLocation.name !== currentLocation.name || inspectedQty !== inventory.qty) {
      worksheetDetail.status = WORKSHEET_STATUS.NOT_TALLY
      targetInventory.status = ORDER_INVENTORY_STATUS.NOT_TALLY
    } else {
      worksheetDetail.status = WORKSHEET_STATUS.DONE
      targetInventory.status = ORDER_INVENTORY_STATUS.INSPECTED
    }

    worksheetDetail.updater = this.user
    await this.trxMgr.getRepository(WorksheetDetail).save(worksheetDetail)

    targetInventory.inspectedLocation = currentLocation
    targetInventory.inspectedQty = inspectedQty
    targetInventory.updater = this.user
    await this.updateOrderTargets([targetInventory])
  }

  async undoInspection(worksheetDetailName: string): Promise<void> {
    let worksheetDetail: WorksheetDetail = await this.findWorksheetDetail(
      { domain: this.domain, name: worksheetDetailName, status: Not(Equal(WORKSHEET_STATUS.EXECUTING)) },
      ['targetInventory']
    )

    let targetInventory: OrderInventory = worksheetDetail.targetInventory
    targetInventory.inspectedLocaiton = null
    targetInventory.inspectedQty = null
    targetInventory.inspectedWeight = null
    targetInventory.status = ORDER_INVENTORY_STATUS.INSPECTING
    targetInventory.updater = this.user
    await this.updateOrderTargets([targetInventory])

    worksheetDetail.status = WORKSHEET_STATUS.EXECUTING
    worksheetDetail.updater = this.user
    await this.trxMgr.getRepository(WorksheetDetail).save(worksheetDetail)
  }

  async completeCycleCount(inventoryCheckNo: string): Promise<Worksheet> {
    const inventoryCheck: InventoryCheck = await this.findRefOrder(InventoryCheck, {
      name: inventoryCheckNo,
      status: ORDER_STATUS.INSPECTING
    })

    let worksheet: Worksheet = await this.findWorksheetByRefOrder(inventoryCheck, WORKSHEET_TYPE.CYCLE_COUNT, [
      'worksheetDetails',
      'worksheetDetails.targetInventory',
      'worksheetDetails.targetInventory.inventory'
    ])
    this.checkRecordValidity(worksheet, { status: WORKSHEET_STATUS.EXECUTING })

    const worksheetDetails: WorksheetDetail[] = worksheet.worksheetDetails
    let targetInventories: OrderInventory[] = worksheetDetails.map((wsd: WorksheetDetail) => wsd.targetInventory)
    const notTallyWorksheetDetails: WorksheetDetail[] = worksheetDetails.filter(
      (wsd: WorksheetDetail) => wsd.status === WORKSHEET_STATUS.NOT_TALLY
    )

    // terminate all order inventory if all inspection accuracy is 100%
    if (!notTallyWorksheetDetails?.length) {
      targetInventories.forEach((targetInventory: OrderInventory) => {
        targetInventory.status = ORDER_INVENTORY_STATUS.TERMINATED
        targetInventory.updater = this.user
      })
      await this.updateOrderTargets(targetInventories)
      worksheet = await this.completWorksheet(worksheet, ORDER_STATUS.DONE)
    } else {
      type InspectionResult = { tallyTargetInventories: OrderInventory[]; nonTallyTargetInventories: OrderInventory[] }

      let { tallyTargetInventories, nonTallyTargetInventories }: InspectionResult = targetInventories.reduce(
        (inspectionResult: InspectionResult, targetInventory) => {
          if (targetInventory.status === ORDER_INVENTORY_STATUS.INSPECTED) {
            inspectionResult.tallyTargetInventories.push(targetInventory)
          } else {
            inspectionResult.nonTallyTargetInventories.push(targetInventory)
          }
          return inspectionResult
        },
        { tallyTargetInventories: [], nonTallyTargetInventories: [] }
      )

      let inventories: Inventory[] = tallyTargetInventories.map(
        (targetInventory: OrderInventory) => targetInventory.inventory
      )
      inventories.forEach((inventory: Inventory) => {
        inventory.lockedQty = 0
        inventory.lockedWeight = 0
        inventory.updater = this.user
      })
      await this.trxMgr.getRepository(Inventory).save(inventories)

      worksheet = await this.completWorksheet(worksheet, ORDER_STATUS.PENDING_REVIEW)

      nonTallyTargetInventories.forEach((targetInventory: OrderInventory) => {
        targetInventory.status = ORDER_INVENTORY_STATUS.INSPECTING
        targetInventory.updater = this.user
      })
      await this.updateOrderTargets(nonTallyTargetInventories)
    }

    return worksheet
  }
}
