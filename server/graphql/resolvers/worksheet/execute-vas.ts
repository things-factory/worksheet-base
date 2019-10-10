import { OrderVas, ORDER_VAS_STATUS } from '@things-factory/sales-base'
import { getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { WorksheetDetail } from '../../../entities'

export const executeVas = {
  async executeVas(_: any, { worksheetDetail }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const worksheetDetailName = worksheetDetail.name

      // 1. update status of worksheetDetail (EXECUTING => DONE)
      const foundWorksheetDetail: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
        where: {
          domain: context.state.domain,
          name: worksheetDetailName,
          status: WORKSHEET_STATUS.EXECUTING,
          type: WORKSHEET_TYPE.VAS
        },
        relations: ['targetVas']
      })

      if (!foundWorksheetDetail) throw new Error("Worksheet doesn't exists")
      const targetVas: OrderVas = foundWorksheetDetail.targetVas
      if (!targetVas) throw new Error("VAS doesn't exists")

      await trxMgr.getRepository(WorksheetDetail).save({
        ...foundWorksheetDetail,
        status: WORKSHEET_STATUS.DONE,
        issue: worksheetDetail.issue ? worksheetDetail.issue : null,
        updater: context.state.user
      })

      // 2. update vas

      await trxMgr.getRepository(OrderVas).save({
        ...targetVas,
        status: worksheetDetail.issue ? ORDER_VAS_STATUS.UNCOMPLETED : ORDER_VAS_STATUS.COMPLETED,
        updater: context.state.user
      })
    })
  }
}
