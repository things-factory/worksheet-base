import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import {
  generateCycleCount,
  InventoryCheck,
  OrderInventory,
  OrderNoGenerator,
  ORDER_INVENTORY_STATUS,
  ORDER_STATUS
} from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory, INVENTORY_STATUS } from '@things-factory/warehouse-base'
import { EntityManager, getManager, In, InsertResult, Not, SelectQueryBuilder, Brackets } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { WorksheetNoGenerator } from '../../../utils'

export const generateCycleCountWorksheetResolver = {
  async generateCycleCountWorksheet(_: any, { executionDate, customerId, orderInventoryIds }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      return await generateCycleCountWorksheet(trxMgr, domain, user, executionDate, customerId, orderInventoryIds)
    })
  }
}

export async function generateCycleCountWorksheet(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  executionDate: string,
  customerId: string,
  orderInventoryIds: string[] = []
): Promise<Worksheet> {
  // Find out warehouse and customer bizplace
  const customerBizplace: Bizplace = await trxMgr.getRepository(Bizplace).findOne(customerId)
  let foundCycleCountWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
    where: {
      domain,
      bizplace: customerBizplace,
      type: In([WORKSHEET_TYPE.CYCLE_COUNT, WORKSHEET_TYPE.CYCLE_COUNT_RECHECK]),
      status: Not(WORKSHEET_STATUS.DONE)
    },
    relations: ['worksheetDetails', 'worksheetDetails.targetInventory', 'inventoryCheck']
  })

  // Create second round of cycle count with specified order inventories
  if (orderInventoryIds.length) {
    // Update status of target inventories (NOT_TALLY => INSPECTING)
    let targetInventories: OrderInventory[] = await trxMgr.getRepository(OrderInventory).findByIds(orderInventoryIds)
    targetInventories.forEach((targetInventory: OrderInventory) => {
      targetInventory.status = ORDER_INVENTORY_STATUS.INSPECTING
      targetInventory.updater = user
    })
    await trxMgr.getRepository(OrderInventory).save(targetInventories)

    // Update status of worksheet (NOT_TALLY => EXECUTING)
    foundCycleCountWorksheet.type = WORKSHEET_TYPE.CYCLE_COUNT_RECHECK
    foundCycleCountWorksheet.status = WORKSHEET_STATUS.EXECUTING
    foundCycleCountWorksheet.endedAt = null
    foundCycleCountWorksheet.updater = user
    await trxMgr.getRepository(Worksheet).save(foundCycleCountWorksheet)

    // Update status of worksheet details (NOT_TALLY => EXECUTING)
    let worksheetDetails = foundCycleCountWorksheet.worksheetDetails.filter(
      (wsd: WorksheetDetail) => orderInventoryIds.indexOf(wsd.targetInventory.id) >= 0
    )
    worksheetDetails.forEach((wsd: WorksheetDetail) => {
      wsd.status = WORKSHEET_STATUS.EXECUTING
      wsd.updater = user
    })
    await trxMgr.getRepository(WorksheetDetail).save(worksheetDetails)

    // Update status of cycle count
    const cycleCount: InventoryCheck = foundCycleCountWorksheet.inventoryCheck
    cycleCount.status = ORDER_STATUS.INSPECTING
    cycleCount.updater = user
    await trxMgr.getRepository(InventoryCheck).save(cycleCount)

    return foundCycleCountWorksheet
  } else {
    // Create first round of cycle count with whole pallets
    if (foundCycleCountWorksheet) {
      throw new Error(`Unfinished cycle count worksheet exists.`)
    }

    const cycleCount: InventoryCheck = await generateCycleCount(trxMgr, domain, user, executionDate, customerId)

    // Find out inventories which is target for cycle counting
    const qb: SelectQueryBuilder<Inventory> = trxMgr.getRepository(Inventory).createQueryBuilder('INV')
    let inventories: Inventory[] = await qb
      .where('INV.domain_id = :domainId', { domainId: domain.id })
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
      throw new Error(`Faield to find inventories`)
    }

    let cycleCountWorksheet: Worksheet = new Worksheet()
    cycleCountWorksheet.domain = domain
    cycleCountWorksheet.bizplace = customerBizplace
    cycleCountWorksheet.name = WorksheetNoGenerator.cycleCount()
    cycleCountWorksheet.inventoryCheck = cycleCount
    cycleCountWorksheet.type = WORKSHEET_TYPE.CYCLE_COUNT
    cycleCountWorksheet.status = WORKSHEET_STATUS.DEACTIVATED
    cycleCountWorksheet.creator = user
    cycleCountWorksheet.updater = user
    cycleCountWorksheet = await trxMgr.getRepository(Worksheet).save(cycleCountWorksheet)

    // generate order inventory mapping with inventory ID
    let targetInventories: OrderInventory[] = []
    for (let i: number = 0; i < inventories.length; i++) {
      const inventory: Inventory = inventories[i]

      let targetInventory: OrderInventory = new OrderInventory()
      targetInventory.domain = domain
      targetInventory.bizplace = customerBizplace
      targetInventory.status = ORDER_INVENTORY_STATUS.PENDING
      targetInventory.name = OrderNoGenerator.orderInventory()
      targetInventory.inventoryCheck = cycleCount
      targetInventory.releaseQty = 0
      targetInventory.releaseWeight = 0
      targetInventory.inventory = inventory
      targetInventory.creator = user
      targetInventory.updater = user
      targetInventories.push(targetInventory)

      inventory.lockedQty = inventory.qty
      inventory.lockedWeight = inventory.weight
      inventory.updater = user
    }

    targetInventories = await trxMgr.getRepository(OrderInventory).save(targetInventories, { chunk: 500 })

    let cycleCountWorksheetDetails: WorksheetDetail[] = []
    for (let i: number = 0; i < targetInventories.length; i++) {
      let targetInventory: OrderInventory = targetInventories[i]

      let cycleCountWorksheetDetail: WorksheetDetail = new WorksheetDetail()
      cycleCountWorksheetDetail.domain = domain
      cycleCountWorksheetDetail.bizplace = customerBizplace
      cycleCountWorksheetDetail.worksheet = cycleCountWorksheet
      cycleCountWorksheetDetail.name = WorksheetNoGenerator.cycleCountDetail()
      cycleCountWorksheetDetail.targetInventory = targetInventory
      cycleCountWorksheetDetail.type = WORKSHEET_TYPE.CYCLE_COUNT
      cycleCountWorksheetDetail.status = WORKSHEET_STATUS.DEACTIVATED
      cycleCountWorksheetDetail.creator = user
      cycleCountWorksheetDetail.updater = user

      cycleCountWorksheetDetails.push(cycleCountWorksheetDetail)
    }

    await trxMgr.getRepository(WorksheetDetail).save(cycleCountWorksheetDetails, { chunk: 500 })

    return cycleCountWorksheet
  }
}
