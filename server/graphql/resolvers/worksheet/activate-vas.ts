import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import { OrderVas, ORDER_STATUS, ORDER_VAS_STATUS, VasOrder } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const activateVasResolver = {
  async activateVas(_: any, { worksheetNo, vasWorksheetDetails }, context: any) {
    return await getManager().transaction(async trxMgr => {
      /**
       * 1. Validation for worksheet
       *    - data existing
       *    - status of worksheet
       */
      return await activateVas(trxMgr, context.state.domain, context.state.user, worksheetNo, vasWorksheetDetails)
    })
  }
}

export async function activateVas(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  worksheetNo: string,
  vasWorksheetDetails: WorksheetDetail[]
) {
  const foundWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
    where: {
      domain,
      name: worksheetNo,
      status: WORKSHEET_STATUS.DEACTIVATED
    },
    relations: ['bizplace', 'vasOrder', 'worksheetDetails', 'worksheetDetails.targetVas']
  })

  if (!foundWorksheet) throw new Error(`Worksheet doesn't exists`)

  const bizplace: Bizplace = foundWorksheet.bizplace
  const foundWSDs: WorksheetDetail[] = foundWorksheet.worksheetDetails.filter(
    (worksheetDetail: WorksheetDetail) => worksheetDetail.status !== WORKSHEET_STATUS.DONE
  )
  const foundVasOrder: VasOrder = foundWorksheet.vasOrder
  let targetVASs: OrderVas[] = foundWSDs
    .map((foundWSD: WorksheetDetail) => foundWSD.targetVas)
    .filter((targetVas: OrderVas) => targetVas.status !== ORDER_STATUS.DONE)

  /**
   * 2. Update description of vas worksheet details
   */
  await Promise.all(
    vasWorksheetDetails.map(async (vasWorksheetDetail: WorksheetDetail) => {
      await trxMgr.getRepository(WorksheetDetail).update(
        {
          domain,
          bizplace,
          name: vasWorksheetDetail.name,
          status: WORKSHEET_STATUS.DEACTIVATED,
          type: WORKSHEET_TYPE.VAS
        },
        {
          description: vasWorksheetDetail.description,
          status: WORKSHEET_STATUS.EXECUTING,
          updater: user
        }
      )
    })
  )

  /**
   * 3. Update target vass (status: READY_TO_PROCESS => PROCESSING)
   */
  targetVASs = targetVASs.map((targetVas: OrderVas) => {
    return {
      ...targetVas,
      status: ORDER_VAS_STATUS.PROCESSING,
      updater: user
    }
  })
  await trxMgr.getRepository(OrderVas).save(targetVASs)

  /**
   * 4. Update VAS Order if it's pure VAS Order (status: READY_TO_PROCESS => PROCESSING)
   */
  if (foundVasOrder?.id) {
    await trxMgr.getRepository(VasOrder).save({
      ...foundVasOrder,
      status: ORDER_STATUS.PROCESSING,
      updater: user
    })
  }

  /**
   * 5. Update Worksheet (status: DEACTIVATED => EXECUTING)
   */
  return await trxMgr.getRepository(Worksheet).save({
    ...foundWorksheet,
    status: WORKSHEET_STATUS.EXECUTING,
    startedAt: new Date(),
    updater: user
  })
}
