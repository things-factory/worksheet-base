import { User } from '@things-factory/auth-base'
import { OrderInventory } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { PickingWorksheetController } from '../../../../controllers/'
import { Worksheet, WorksheetDetail } from '../../../../entities'

export const generateReleaseGoodWorksheetResolver = {
  async generateReleaseGoodWorksheet(_: any, { releaseGoodNo }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      return await generatePickingWorksheet(trxMgr, domain, user, releaseGoodNo)
    })
  }
}

export async function generatePickingWorksheet(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  releaseGoodNo: string
): Promise<Worksheet> {
  const worksheetController: PickingWorksheetController = new PickingWorksheetController(trxMgr, domain, user)
  return await worksheetController.generatePickingWorksheet(releaseGoodNo)
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
  user: User,
  worksheet: Worksheet,
  targetInventory: Partial<OrderInventory>[]
): Promise<WorksheetDetail[]> {
  const worksheetController: PickingWorksheetController = new PickingWorksheetController(trxMgr, domain, user)
  return await worksheetController.generatePickingWorksheetDetail(worksheet, targetInventory)
}
