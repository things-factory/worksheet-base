import { User } from '@things-factory/auth-base'
import { OrderVas, ORDER_VAS_STATUS } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { WorksheetDetail } from '../../../entities'

export const executeVasResolver = {
  async executeVas(_: any, { worksheetDetail }, context: any) {
    return await getManager().transaction(async trxMgr => {
      await executeVas(trxMgr, worksheetDetail, context.state.domain, context.state.user)
    })
  }
}

export async function executeVas(trxMgr: EntityManager, worksheetDetail: WorksheetDetail, domain: Domain, user: User) {
  const worksheetDetailName = worksheetDetail.name
  // 1. update status of worksheetDetail (EXECUTING => DONE)
  const foundWorksheetDetail: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
    where: {
      domain,
      name: worksheetDetailName,
      status: WORKSHEET_STATUS.EXECUTING,
      type: WORKSHEET_TYPE.VAS
    },
    relations: ['targetVas', 'targetVas.bizplace', 'targetVas.vas']
  })

  if (!foundWorksheetDetail) throw new Error("Worksheet doesn't exists")

  let targetVas: OrderVas = foundWorksheetDetail.targetVas
  if (!targetVas) throw new Error("VAS doesn't exists")

  await trxMgr.getRepository(WorksheetDetail).save({
    ...foundWorksheetDetail,
    status: WORKSHEET_STATUS.DONE,
    issue: worksheetDetail.issue ? worksheetDetail.issue : null,
    updater: user
  })

  // 2. update vas
  await trxMgr.getRepository(OrderVas).save({
    ...targetVas,
    status: ORDER_VAS_STATUS.COMPLETED,
    updater: user
  })
}
