import { OrderVas, ORDER_VAS_STATUS, Vas } from '@things-factory/sales-base'
import { getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { relabel, repack } from '../../../controllers/vas-transactions'
import { WorksheetDetail } from '../../../entities'

export const executeVas = {
  async executeVas(_: any, { worksheetDetail, completeParams }, context: any) {
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

      const vas: Vas = foundWorksheetDetail.targetVas.vas
      if (vas.operationGuide) {
        switch (vas.operationGuide) {
          case 'vas-relabel':
            await relabel(trxMgr, targetVas, context)
            break

          case 'vas-repack':
            const params = JSON.parse(completeParams)
            await repack(trxMgr, targetVas, params, context)
            break
        }
      }

      await trxMgr.getRepository(WorksheetDetail).save({
        ...foundWorksheetDetail,
        status: WORKSHEET_STATUS.DONE,
        issue: worksheetDetail.issue ? worksheetDetail.issue : null,
        updater: context.state.user
      })

      // 2. update vas

      await trxMgr.getRepository(OrderVas).save({
        ...targetVas,
        status: ORDER_VAS_STATUS.COMPLETED,
        updater: context.state.user
      })
    })
  }
}
