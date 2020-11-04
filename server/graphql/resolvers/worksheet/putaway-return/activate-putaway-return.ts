import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, Equal, getManager, Not } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../../constants'
import { PutawayReturningWorksheetController } from '../../../../controllers'
import { Worksheet, WorksheetDetail } from '../../../../entities'

export const activatePutawayReturnResolver = {
  async activatePutawayReturn(_: any, { worksheetNo, putawayWorksheetDetails }, context: any) {
    return await getManager().transaction(async (trxMgr: EntityManager) => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      const foundWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
        where: {
          domain,
          name: worksheetNo,
          status: WORKSHEET_STATUS.DEACTIVATED,
          type: WORKSHEET_TYPE.PUTAWAY_RETURN
        },
        relations: ['bizplace', 'returnOrder', 'worksheetDetails', 'worksheetDetails.targetInventory']
      })

      if (!foundWorksheet) throw new Error(`Worksheet doesn't exists`)

      const relatedWorksheetCnt: number = await trxMgr.getRepository(Worksheet).count({
        where: {
          domain,
          returnOrder: foundWorksheet.returnOrder,
          type: WORKSHEET_TYPE.VAS,
          status: Not(Equal(WORKSHEET_STATUS.DONE))
        }
      })

      if (relatedWorksheetCnt) {
        throw new Error(`Related VAS order with GAN: ${foundWorksheet.arrivalNotice.name} is still under processing.`)
      }

      return await activatePutawayReturn(trxMgr, domain, user, worksheetNo, putawayWorksheetDetails)
    })
  }
}

export async function activatePutawayReturn(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  worksheetNo: string,
  putawayWorksheetDetails: Partial<WorksheetDetail>[]
) {
  const worksheetController: PutawayReturningWorksheetController = new PutawayReturningWorksheetController(trxMgr, domain, user)
  await worksheetController.activatePutawayReturning(worksheetNo, putawayWorksheetDetails)
}
