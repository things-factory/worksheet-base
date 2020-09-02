import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, Equal, getManager, Not } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../../constants'
import { OutboundWorksheetController } from '../../../../controllers'
import { Worksheet, WorksheetDetail } from '../../../../entities'

export const activateLoadingResolver = {
  async activateLoading(_: any, { worksheetNo, loadingWorksheetDetails }, context: any) {
    return getManager().transaction(async (trxMgr: EntityManager) => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      const foundWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
        where: {
          domain,
          name: worksheetNo,
          status: WORKSHEET_STATUS.DEACTIVATED,
          type: WORKSHEET_TYPE.LOADING
        },
        relations: ['bizplace', 'releaseGood', 'worksheetDetails', 'worksheetDetails.targetInventory']
      })

      if (!foundWorksheet) throw new Error(`Worksheet doesn't exists`)

      const relatedWorksheetCnt: number = await trxMgr.getRepository(Worksheet).count({
        where: {
          domain,
          releaseGood: foundWorksheet.releaseGood,
          type: WORKSHEET_TYPE.VAS,
          status: Not(Equal(WORKSHEET_STATUS.DONE))
        }
      })

      // Stop to activate loading worksheet with Exception
      // This resolver is being called from client side not from other resolver.
      // So if there's a related worksheet, it should throw an Error to inform user about non-finished order.
      if (relatedWorksheetCnt) {
        throw new Error(`Related VAS order with RO: ${foundWorksheet.releaseGood.name} is still under processing.`)
      }

      return await activateLoading(trxMgr, domain, user, worksheetNo, loadingWorksheetDetails)
    })
  }
}

export async function activateLoading(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  worksheetNo: string,
  loadingWorksheetDetails: Partial<WorksheetDetail>[]
): Promise<Worksheet> {
  const worksheetController: OutboundWorksheetController = new OutboundWorksheetController(trxMgr)
  return await worksheetController.activateLoading({
    domain,
    user,
    worksheetNo,
    loadingWorksheetDetails
  })
}
