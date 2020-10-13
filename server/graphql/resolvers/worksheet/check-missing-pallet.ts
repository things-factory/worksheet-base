import { User } from '@things-factory/auth-base'
import { OrderInventory, ORDER_INVENTORY_STATUS } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { WorksheetDetail } from '../../../entities'

export const checkMissingPalletResolver = {
  async checkMissingPallet(_: any, { worksheetDetailName }, context: any) {
    return getManager().transaction(async (trxMgr: EntityManager) => {
      const { domain, user }: { domain: Domain; user: User } = context.state

      await checkMissingPallet(trxMgr, domain, user, worksheetDetailName)
    })
  }
}

export async function checkMissingPallet(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  worksheetDetailName: string
): Promise<void> {
  const worksheetDetail: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
    where: { domain, name: worksheetDetailName, status: WORKSHEET_STATUS.EXECUTING, type: WORKSHEET_TYPE.CYCLE_COUNT },
    relations: ['targetInventory']
  })

  if (!worksheetDetail) {
    throw new Error('Failed to find worksheet detail')
  }
  const targetInventory: OrderInventory = worksheetDetail.targetInventory

  worksheetDetail.status = WORKSHEET_STATUS.NOT_TALLY
  worksheetDetail.updater = user
  await trxMgr.getRepository(WorksheetDetail).save(worksheetDetail)

  targetInventory.status = ORDER_INVENTORY_STATUS.MISSING
  targetInventory.updater = user
  await trxMgr.getRepository(OrderInventory).save(targetInventory)
}
