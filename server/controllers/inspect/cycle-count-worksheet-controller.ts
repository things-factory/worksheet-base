import { Bizplace } from '@things-factory/biz-base'
import {
  generateCycleCount,
  InventoryCheck,
  OrderInventory,
  OrderNoGenerator,
  ORDER_INVENTORY_STATUS,
  ORDER_STATUS
} from '@things-factory/sales-base'
import { Inventory, Location, INVENTORY_STATUS } from '@things-factory/warehouse-base'
import { Brackets, Equal, Not, SelectQueryBuilder, In } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../constants'
import { Worksheet, WorksheetDetail } from '../../entities'
import { WorksheetController } from '../worksheet-controller'
import { WorksheetNoGenerator } from '../../utils'

export class CycleCountWorksheetController extends WorksheetController {
  async generateCycleCountWorksheet(executionDate: string, customerId: string, orderInventoryIds: string[] = []): Promise<Worksheet> {
    // Find out warehouse and customer bizplace
    const customerBizplace: Bizplace = await this.trxMgr.getRepository(Bizplace).findOne(customerId)
    let foundCycleCountWorksheet: Worksheet = await this.trxMgr.getRepository(Worksheet).findOne({
      where: {
        domain: this.domain,
        bizplace: customerBizplace,
        type: In([WORKSHEET_TYPE.CYCLE_COUNT, WORKSHEET_TYPE.CYCLE_COUNT_RECHECK]),
        status: Not(WORKSHEET_STATUS.DONE)
      },
      relations: ['worksheetDetails', 'worksheetDetails.targetInventory', 'inventoryCheck']
    })
  
    // Create second round of cycle count with specified order inventories
    if (orderInventoryIds.length) {
      // Update status of target inventories (NOT_TALLY => INSPECTING)
      let targetInventories: OrderInventory[] = await this.trxMgr.getRepository(OrderInventory).findByIds(orderInventoryIds)
      targetInventories.forEach((targetInventory: OrderInventory) => {
        targetInventory.status = ORDER_INVENTORY_STATUS.INSPECTING
        targetInventory.updater = this.user
      })
      await this.trxMgr.getRepository(OrderInventory).save(targetInventories)

      // Update status of worksheet (NOT_TALLY => EXECUTING)
      foundCycleCountWorksheet.type = WORKSHEET_TYPE.CYCLE_COUNT_RECHECK
      foundCycleCountWorksheet.status = WORKSHEET_STATUS.EXECUTING
      foundCycleCountWorksheet.endedAt = null
      foundCycleCountWorksheet.updater = this.user
      await this.trxMgr.getRepository(Worksheet).save(foundCycleCountWorksheet)

      // Update status of worksheet details (NOT_TALLY => EXECUTING)
      let worksheetDetails = foundCycleCountWorksheet.worksheetDetails.filter(
        (wsd: WorksheetDetail) => orderInventoryIds.indexOf(wsd.targetInventory.id) >= 0
      )
      worksheetDetails.forEach((wsd: WorksheetDetail) => {
        wsd.status = WORKSHEET_STATUS.EXECUTING
        wsd.updater = this.user
      })
      await this.trxMgr.getRepository(WorksheetDetail).save(worksheetDetails)

      // Update status of cycle count
      const cycleCount: InventoryCheck = foundCycleCountWorksheet.inventoryCheck
      cycleCount.status = ORDER_STATUS.INSPECTING
      cycleCount.updater = this.user
      await this.trxMgr.getRepository(InventoryCheck).save(cycleCount)

      return foundCycleCountWorksheet
    } else {
      // Create first round of cycle count with whole pallets
      if (foundCycleCountWorksheet) {
        throw new Error(`Unfinished cycle count worksheet exists.`)
      }

      const cycleCount: InventoryCheck = await generateCycleCount(this.trxMgr, this.domain, this.user, executionDate, customerId)

      // Find out inventories which is target for cycle counting
      const qb: SelectQueryBuilder<Inventory> = this.trxMgr.getRepository(Inventory).createQueryBuilder('INV')
      let inventories: Inventory[] = await qb
        .leftJoinAndSelect('INV.location', 'LOC')
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

      let cycleCountWorksheet: Worksheet = new Worksheet()
      cycleCountWorksheet.domain = this.domain
      cycleCountWorksheet.bizplace = customerBizplace
      cycleCountWorksheet.name = WorksheetNoGenerator.cycleCount()
      cycleCountWorksheet.inventoryCheck = cycleCount
      cycleCountWorksheet.type = WORKSHEET_TYPE.CYCLE_COUNT
      cycleCountWorksheet.status = WORKSHEET_STATUS.DEACTIVATED
      cycleCountWorksheet.creator = this.user
      cycleCountWorksheet.updater = this.user
      cycleCountWorksheet = await this.trxMgr.getRepository(Worksheet).save(cycleCountWorksheet)

      // generate order inventory mapping with inventory ID
      let targetInventories: OrderInventory[] = []
      for (let i: number = 0; i < inventories.length; i++) {
        const inventory: Inventory = inventories[i]

        let targetInventory: OrderInventory = new OrderInventory()
        targetInventory.domain = this.domain
        targetInventory.bizplace = customerBizplace
        targetInventory.status = ORDER_INVENTORY_STATUS.PENDING
        targetInventory.name = OrderNoGenerator.orderInventory()
        targetInventory.inventoryCheck = cycleCount
        targetInventory.originQty = inventory.qty
        targetInventory.originWeight = inventory.weight
        targetInventory.originBatchNo = inventory.batchId
        targetInventory.originLocation = inventory.location
        targetInventory.releaseQty = 0
        targetInventory.releaseWeight = 0
        targetInventory.inventory = inventory
        targetInventory.creator = this.user
        targetInventory.updater = this.user
        targetInventories.push(targetInventory)

        inventory.lockedQty = inventory.qty
        inventory.lockedWeight = inventory.weight
        inventory.updater = this.user
      }

      targetInventories = await this.trxMgr.getRepository(OrderInventory).save(targetInventories, { chunk: 500 })

      let cycleCountWorksheetDetails: WorksheetDetail[] = []
      for (let i: number = 0; i < targetInventories.length; i++) {
        let targetInventory: OrderInventory = targetInventories[i]

        let cycleCountWorksheetDetail: WorksheetDetail = new WorksheetDetail()
        cycleCountWorksheetDetail.domain = this.domain
        cycleCountWorksheetDetail.bizplace = customerBizplace
        cycleCountWorksheetDetail.worksheet = cycleCountWorksheet
        cycleCountWorksheetDetail.name = WorksheetNoGenerator.cycleCountDetail()
        cycleCountWorksheetDetail.targetInventory = targetInventory
        cycleCountWorksheetDetail.type = WORKSHEET_TYPE.CYCLE_COUNT
        cycleCountWorksheetDetail.status = WORKSHEET_STATUS.DEACTIVATED
        cycleCountWorksheetDetail.creator = this.user
        cycleCountWorksheetDetail.updater = this.user

        cycleCountWorksheetDetails.push(cycleCountWorksheetDetail)
      }

      await this.trxMgr.getRepository(WorksheetDetail).save(cycleCountWorksheetDetails, { chunk: 500 })

      return cycleCountWorksheet
    }
  }

  async activateCycleCount(worksheetNo: string): Promise<Worksheet> {
    let worksheet: Worksheet = await this.findActivatableWorksheet(worksheetNo, WORKSHEET_TYPE.CYCLE_COUNT, [
      'inventoryCheck',
      'worksheetDetails',
      'worksheetDetails.targetInventory'
    ])

    let worksheetDetails: WorksheetDetail[] = worksheet.worksheetDetails
    let targetInventories: OrderInventory[] = worksheetDetails.map((wsd: WorksheetDetail) => wsd.targetInventory)

    for (let i: number = 0; i < targetInventories.length; i++) {
      let targetInventory: OrderInventory = targetInventories[i]
      targetInventory.status = ORDER_INVENTORY_STATUS.INSPECTING
      targetInventory.updater = this.user
    }
    await this.trxMgr.getRepository(OrderInventory).save(targetInventories, { chunk: 500 })

    for (let i: number = 0; i < worksheetDetails.length; i++) {
      let foundWSD: WorksheetDetail = worksheetDetails[i]
      foundWSD.status = WORKSHEET_STATUS.EXECUTING
      foundWSD.updater = this.user
    }
    await this.trxMgr.getRepository(WorksheetDetail).save(worksheetDetails, { chunk: 500 })

    worksheet.status = WORKSHEET_STATUS.EXECUTING
    worksheet.startedAt = new Date()
    worksheet.updater = this.user
    worksheet = await this.trxMgr.getRepository(Worksheet).save(worksheet)

    let cycleCount: InventoryCheck = worksheet.inventoryCheck
    cycleCount.status = ORDER_STATUS.INSPECTING
    cycleCount.updater = this.user
    await this.updateRefOrder(cycleCount)
    return worksheet
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
    targetInventory.status =
    targetInventory.status === ORDER_INVENTORY_STATUS.RELOCATED
      ? ORDER_INVENTORY_STATUS.MISSING
      : ORDER_INVENTORY_STATUS.INSPECTING
    targetInventory.updater = this.user
    await this.updateOrderTargets([targetInventory])

    worksheetDetail.status = WORKSHEET_STATUS.EXECUTING
    worksheetDetail.updater = this.user
    await this.trxMgr.getRepository(WorksheetDetail).save(worksheetDetail)
  }

  async checkMissingPallet(worksheetDetailName: string): Promise<void> {
    let worksheetDetail: WorksheetDetail = await this.findExecutableWorksheetDetailByName(
      worksheetDetailName,
      WORKSHEET_TYPE.CYCLE_COUNT,
      ['targetInventory']
    )

    let targetInventory: OrderInventory = worksheetDetail.targetInventory
    worksheetDetail.status = WORKSHEET_STATUS.NOT_TALLY
    worksheetDetail.updater = this.user
    await this.trxMgr.getRepository(WorksheetDetail).save(worksheetDetail)
  
    targetInventory.status = ORDER_INVENTORY_STATUS.MISSING
    targetInventory.updater = this.user
    await this.updateOrderTargets([targetInventory])  
  }

  async addExtraPallet(cycleCountNo: string, palletId: string, inspectedBatchNo: string, inspectedQty: number, inspectedWeight: number, locationName: string): Promise<void> {
    const inventoryCheck: InventoryCheck = await this.findRefOrder(
      InventoryCheck, 
      {
        name: cycleCountNo,
        status: ORDER_STATUS.INSPECTING
      },
      ['bizplace']
    )

    const bizplace: Bizplace = inventoryCheck.bizplace
    const qb: SelectQueryBuilder<Inventory> = this.trxMgr.getRepository(Inventory).createQueryBuilder('INV')
    let inventory: Inventory = await qb
    .where('INV.domain = :domainId', { domainId: this.domain.id })
    .andWhere('INV.bizplace = :bizplaceId', { bizplaceId: bizplace.id })
    .andWhere('INV.palletId = :palletId', { palletId })
    .andWhere('INV.status = :status', { status: INVENTORY_STATUS.STORED })
    .andWhere(
      new Brackets(qb => {
        qb.where('INV.lockedQty ISNULL')
        qb.orWhere('INV.lockedQty = 0')
      })
    )
    .getOne()
    if (!inventory) throw new Error('Failed to find inventory')

    const worksheet: Worksheet = await this.trxMgr.getRepository(Worksheet).findOne({
      where: { domain: this.domain, type: WORKSHEET_TYPE.CYCLE_COUNT, status: WORKSHEET_STATUS.EXECUTING, inventoryCheck }
    })
    const location: Location = await this.trxMgr.getRepository(Location).findOne({
      where: { domain: this.domain, name: locationName }
    })
    
    let targetInventory: OrderInventory = new OrderInventory()
    targetInventory.domain = this.domain
    targetInventory.bizplace = bizplace
    targetInventory.status = ORDER_INVENTORY_STATUS.ADDED
    targetInventory.name = OrderNoGenerator.orderInventory()
    targetInventory.inventoryCheck = inventoryCheck
    targetInventory.inventory = inventory
    targetInventory.inspectedBatchNo = inspectedBatchNo
    targetInventory.inspectedQty = inspectedQty
    targetInventory.inspectedWeight = inspectedWeight
    targetInventory.inspectedLocation = location
    targetInventory.creator = this.user
    targetInventory.updater = this.user
    await this.updateOrderTargets([targetInventory])  

    let worksheetDetail: WorksheetDetail = new WorksheetDetail()
    worksheetDetail.domain = this.domain
    worksheetDetail.bizplace = bizplace
    worksheetDetail.worksheet = worksheet
    worksheetDetail.name = WorksheetNoGenerator.cycleCountDetail()
    worksheetDetail.targetInventory = targetInventory
    worksheetDetail.type = WORKSHEET_TYPE.CYCLE_COUNT
    worksheetDetail.status = WORKSHEET_STATUS.NOT_TALLY
    worksheetDetail.creator = this.user
    worksheetDetail.updater = this.user
    await this.trxMgr.getRepository(WorksheetDetail).save(worksheetDetail)
  }

  async relocatePallet( worksheetDetailName: string, inspectedBatchNo: string, inspectedQty: number, inspectedWeight: number, inspectedLocationName: string ): Promise<void> {
    let worksheetDetail: WorksheetDetail = await this.trxMgr.getRepository(WorksheetDetail).findOne({
      where: { domain: this.domain, name: worksheetDetailName, type: WORKSHEET_TYPE.CYCLE_COUNT },
      relations: ['targetInventory', 'targetInventory.inventory', 'targetInventory.inventory.location']
    })
    
    if (!worksheetDetail) throw new Error('Failed to find worksheet detail')
    
    let targetInventory: OrderInventory = worksheetDetail.targetInventory
    const location: Location = targetInventory?.inventory?.location
    if (location.name === inspectedLocationName) throw new Error(`You can't relocate at same location`)
  
    const inspectedLocation: Location = await this.trxMgr.getRepository(Location).findOne({
      where: { name: inspectedLocationName, domain: this.domain }
    })
  
    worksheetDetail.status = WORKSHEET_STATUS.NOT_TALLY
    worksheetDetail.updater = this.user
    await this.trxMgr.getRepository(WorksheetDetail).save(worksheetDetail)
  
    targetInventory.inspectedLocation = inspectedLocation
    targetInventory.inspectedBatchNo = inspectedBatchNo
    targetInventory.inspectedQty = inspectedQty
    targetInventory.inspectedWeight = inspectedWeight
    targetInventory.status = ORDER_INVENTORY_STATUS.RELOCATED
    targetInventory.updater = this.user
    await this.updateOrderTargets([targetInventory])  
  }

  async completeCycleCount(inventoryCheckNo: string): Promise<Worksheet> {
    const inventoryCheck: InventoryCheck = await this.findRefOrder(InventoryCheck, {
      name: inventoryCheckNo,
      status: ORDER_STATUS.INSPECTING
    })

    let worksheet: Worksheet = await this.trxMgr.getRepository(Worksheet).findOne({
      where: {
        domain: this.domain,
        status: WORKSHEET_STATUS.EXECUTING,
        type: In([WORKSHEET_TYPE.CYCLE_COUNT, WORKSHEET_TYPE.CYCLE_COUNT_RECHECK]),
        inventoryCheck
      },
      relations: ['worksheetDetails', 'worksheetDetails.targetInventory', 'worksheetDetails.targetInventory.inventory']
    })
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
    await this.trxMgr.getRepository(OrderInventory).save(tallyTargetInventories, { chunk: 500 })

    tallyInventories.forEach((inventory: Inventory) => {
      inventory.lockedQty = 0
      inventory.lockedWeight = 0
      inventory.updater = this.user
    })
    await this.trxMgr.getRepository(Inventory).save(tallyInventories, { chunk: 500 })

    if (notTallyTargetInventories.length) {
      worksheet.status = WORKSHEET_STATUS.NOT_TALLY
      inventoryCheck.status = ORDER_STATUS.PENDING_REVIEW
    } else {
      worksheet.status = WORKSHEET_STATUS.DONE
      inventoryCheck.status = ORDER_STATUS.DONE
    }

    worksheet.endedAt = new Date()
    worksheet.updater = this.user
    await this.trxMgr.getRepository(Worksheet).save(worksheet)

    inventoryCheck.updater = this.user
    await this.trxMgr.getRepository(InventoryCheck).save(inventoryCheck)

    return worksheet
  }
}
