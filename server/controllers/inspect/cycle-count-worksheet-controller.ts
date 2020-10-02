import { Bizplace } from '@things-factory/biz-base'
import {
  generateCycleCount,
  InventoryCheck,
  OrderInventory,
  OrderNoGenerator,
  ORDER_INVENTORY_STATUS,
  ORDER_STATUS
} from '@things-factory/sales-base'
import { Inventory, INVENTORY_STATUS } from '@things-factory/warehouse-base'
import { Brackets, Equal, Not, SelectQueryBuilder } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../constants'
import { Worksheet, WorksheetDetail } from '../../entities'
import { WorksheetController } from '../worksheet-controller'

export class CycleCountWorksheetController extends WorksheetController {
  async generateCycleCountWorksheet(executionDate: string, customerId: string): Promise<Worksheet> {
    // Find out warehouse and customer bizplace
    const customerBizplace: Bizplace = await this.trxMgr.getRepository(Bizplace).findOne(customerId)
    const existingWorksheetCnt: number = await this.trxMgr.getRepository(Worksheet).count({
      where: {
        domain: this.domain,
        bizplace: customerBizplace,
        type: WORKSHEET_TYPE.CYCLE_COUNT,
        status: Not(WORKSHEET_STATUS.DONE)
      }
    })

    if (existingWorksheetCnt) {
      throw new Error(`Unfinished cycle count worksheet exists.`)
    }

    const cycleCount: InventoryCheck = await generateCycleCount(
      this.trxMgr,
      this.domain,
      this.user,
      executionDate,
      customerId
    )

    // Find out inventories which is target for cycle counting
    const qb: SelectQueryBuilder<Inventory> = this.trxMgr.getRepository(Inventory).createQueryBuilder('INV')
    let inventories: Inventory[] = await qb

      .where('INV.domain_id = :domainId', { domainId: this.domain.id })
      .andWhere('INV.bizplace_id = :bizplaceId', { bizplaceId: customerBizplace.id })
      .andWhere('INV.status = :status', { status: INVENTORY_STATUS.STORED })
      .andWhere(
        new Brackets(qb => {
          qb.where('"INV"."locked_qty" ISNULL')
          qb.orWhere('"INV"."locked_qty" = 0')
        })
      )
      .getMany()

    if (!inventories.length) {
      throw new Error(`Failed to find inventories`)
    }

    let targetInventories: OrderInventory[] = []
    if (!targetInventories.length)
      for (const inventory of inventories) {
        let targetInventory: OrderInventory = new OrderInventory()
        targetInventory.domain = this.domain
        targetInventory.bizplace = customerBizplace
        targetInventory.status = ORDER_INVENTORY_STATUS.PENDING
        targetInventory.name = OrderNoGenerator.orderInventory()
        targetInventory.inventoryCheck = cycleCount
        targetInventory.releaseQty = 0
        targetInventory.releaseWeight = 0
        targetInventory.inventory = inventory
        targetInventory.creator = this.user
        targetInventory.updater = this.user

        targetInventories.push(targetInventory)
      }
    targetInventories = await this.trxMgr.getRepository(OrderInventory).save(targetInventories)

    // // set a locked qty at all inventory
    inventories.forEach((inventory: Inventory) => {
      inventory.lockedQty = inventory.qty
      inventory.lockedWeight = inventory.weight
      inventory.updater = this.user
    })
    await this.trxMgr.getRepository(Inventory).save(inventories)

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
    inspectedBatchNo: string,
    inspectedQty: number,
    inspectedWeight: number
  ): Promise<void> {
    let worksheetDetail: WorksheetDetail = await this.findExecutableWorksheetDetailByName(
      worksheetDetailName,
      WORKSHEET_TYPE.CYCLE_COUNT,
      ['targetInventory', 'targetInventory.inventory', 'targetInventory.inventory.location']
    )

    let targetInventory: OrderInventory = worksheetDetail.targetInventory
    const inventory: Inventory = targetInventory.inventory
    const { batchId, qty, weight }: { batchId: string; qty: number; weight: number } = inventory

    const isChanged: boolean = batchId !== inspectedBatchNo || qty !== inspectedQty || weight !== inspectedWeight
    const worksheetDetailStatus: string = isChanged ? WORKSHEET_STATUS.NOT_TALLY : WORKSHEET_STATUS.DONE
    const targetInventoryStatus: string = isChanged
      ? ORDER_INVENTORY_STATUS.NOT_TALLY
      : ORDER_INVENTORY_STATUS.INSPECTED

    worksheetDetail.status = worksheetDetailStatus
    worksheetDetail.updater = this.user
    await this.trxMgr.getRepository(WorksheetDetail).save(worksheetDetail)

    targetInventory.inspectedBatchNo = inspectedBatchNo
    targetInventory.inspectedQty = inspectedQty
    targetInventory.inspectedWeight = inspectedWeight
    targetInventory.inspectedLocation = targetInventory.inventory.location
    targetInventory.status = targetInventoryStatus
    targetInventory.updater = this.user
    await this.updateOrderTargets([targetInventory])
  }

  async undoInspection(worksheetDetailName: string): Promise<void> {
    let worksheetDetail: WorksheetDetail = await this.findWorksheetDetail(
      { domain: this.domain, name: worksheetDetailName, status: Not(Equal(WORKSHEET_STATUS.EXECUTING)) },
      ['targetInventory']
    )

    let targetInventory: OrderInventory = worksheetDetail.targetInventory
    targetInventory.inspectedBatchNo = null
    targetInventory.inspectedQty = null
    targetInventory.inspectedWeight = null
    targetInventory.inspectedLocation = null
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
    const targetInventories: OrderInventory[] = worksheetDetails.map((wsd: WorksheetDetail) => wsd.targetInventory)

    const {
      tallyTargetInventories,
      notTallyTargetInventories
    }: {
      tallyTargetInventories: OrderInventory[]
      notTallyTargetInventories: OrderInventory[]
    } = targetInventories.reduce(
      (result, targetInventory: OrderInventory) => {
        if (targetInventory.status !== ORDER_INVENTORY_STATUS.INSPECTED) {
          result.notTallyTargetInventories.push(targetInventory)
        } else {
          result.tallyTargetInventories.push(targetInventory)
        }

        return result
      },
      {
        tallyTargetInventories: [],
        notTallyTargetInventories: []
      }
    )

    const tallyInventories: Inventory[] = tallyTargetInventories.map(targetInventory => targetInventory.inventory)
    tallyTargetInventories.forEach((targetInventory: OrderInventory) => {
      targetInventory.status = ORDER_INVENTORY_STATUS.TERMINATED
      targetInventory.updater = this.user
    })
    await this.updateOrderTargets(tallyTargetInventories)

    tallyInventories.forEach((inventory: Inventory) => {
      inventory.lockedQty = 0
      inventory.lockedWeight = 0
      inventory.updater = this.user
    })
    await this.trxMgr.getRepository(Inventory).save(tallyInventories)

    worksheet = await this.completWorksheet(worksheet, WORKSHEET_STATUS.DONE)
    worksheet.status = WORKSHEET_STATUS.DONE

    if (notTallyTargetInventories.length) {
      inventoryCheck.status = ORDER_STATUS.PENDING_REVIEW
    } else {
      inventoryCheck.status = ORDER_STATUS.DONE
    }
    inventoryCheck.updater = this.user
    await this.trxMgr.getRepository(InventoryCheck).save(inventoryCheck)

    return worksheet
  }
}
