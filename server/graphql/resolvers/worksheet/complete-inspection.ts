import { User } from '@things-factory/auth-base'
import { InventoryCheck, OrderInventory, ORDER_INVENTORY_STATUS, ORDER_STATUS } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory } from '@things-factory/warehouse-base'
import { EntityManager, getManager, In } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const completeInspectionResolver = {
  async completeInspection(_: any, { inventoryCheckNo }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await completeInspection(trxMgr, domain, user, inventoryCheckNo)
    })
  }
}

export async function completeInspection(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  inventoryCheckNo: string
): Promise<void> {
  const inventoryCheck: InventoryCheck = await trxMgr.getRepository(InventoryCheck).findOne({
    where: { domain, name: inventoryCheckNo, status: ORDER_STATUS.INSPECTING },
    relations: ['orderInventories']
  })

  if (!inventoryCheck) throw new Error(`Inspection order doesn't exists.`)

  const worksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
    where: {
      domain,
      status: WORKSHEET_STATUS.EXECUTING,
      type: In([WORKSHEET_TYPE.CYCLE_COUNT, WORKSHEET_TYPE.CYCLE_COUNT_RECHECK]),
      inventoryCheck
    },
    relations: ['worksheetDetails', 'worksheetDetails.targetInventory', 'worksheetDetails.targetInventory.inventory']
  })

  if (!worksheet) throw new Error(`Worksheet doesn't exists.`)
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
    targetInventory.updater = user
  })
  await trxMgr.getRepository(OrderInventory).save(tallyTargetInventories, { chunk: 500 })

  tallyInventories.forEach((inventory: Inventory) => {
    inventory.lockedQty = 0
    inventory.lockedWeight = 0
    inventory.updater = user
  })
  await trxMgr.getRepository(Inventory).save(tallyInventories, { chunk: 500 })

  if (notTallyTargetInventories.length) {
    worksheet.status = WORKSHEET_STATUS.NOT_TALLY
    inventoryCheck.status = ORDER_STATUS.PENDING_REVIEW
  } else {
    worksheet.status = WORKSHEET_STATUS.DONE
    inventoryCheck.status = ORDER_STATUS.DONE
  }

  worksheet.endedAt = new Date()
  worksheet.updater = user
  await trxMgr.getRepository(Worksheet).save(worksheet)

  inventoryCheck.updater = user
  await trxMgr.getRepository(InventoryCheck).save(inventoryCheck)
}
