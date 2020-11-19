import { User } from '@things-factory/auth-base'
import { OrderInventory, ORDER_INVENTORY_STATUS } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Location } from '@things-factory/warehouse-base'
import { EntityManager, getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { WorksheetDetail } from '../../../entities'

export const relocatePalletResolver = {
  async relocatePallet(
    _: any,
    { worksheetDetailName, inspectedBatchNo, inspectedQty, inspectedUomValue, inspectedLocationName },
    context: any
  ): Promise<void> {
    return getManager().transaction(async (trxMgr: EntityManager) => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await relocatePallet(
        trxMgr,
        domain,
        user,
        worksheetDetailName,
        inspectedBatchNo,
        inspectedQty,
        inspectedUomValue,
        inspectedLocationName
      )
    })
  }
}

export async function relocatePallet(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  worksheetDetailName: string,
  inspectedBatchNo: string,
  inspectedQty: number,
  inspectedUomValue: number,
  inspectedLocationName: string
): Promise<void> {
  let worksheetDetail: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
    where: { domain, name: worksheetDetailName, type: WORKSHEET_TYPE.CYCLE_COUNT },
    relations: ['targetInventory', 'targetInventory.inventory', 'targetInventory.inventory.location']
  })

  if (!worksheetDetail) throw new Error('Failed to find worksheet detail')

  let targetInventory: OrderInventory = worksheetDetail.targetInventory
  const location: Location = targetInventory?.inventory?.location
  if (location.name === inspectedLocationName) throw new Error(`You can't relocate at same location`)

  const inspectedLocation: Location = await trxMgr.getRepository(Location).findOne({
    where: { name: inspectedLocationName, domain }
  })

  worksheetDetail.status = WORKSHEET_STATUS.NOT_TALLY
  worksheetDetail.updater = user
  await trxMgr.getRepository(WorksheetDetail).save(worksheetDetail)

  targetInventory.inspectedLocation = inspectedLocation
  targetInventory.inspectedBatchNo = inspectedBatchNo
  targetInventory.inspectedQty = inspectedQty
  targetInventory.inspectedUomValue = inspectedUomValue
  targetInventory.status = ORDER_INVENTORY_STATUS.RELOCATED
  targetInventory.updater = user
  await trxMgr.getRepository(OrderInventory).save(targetInventory)
}
