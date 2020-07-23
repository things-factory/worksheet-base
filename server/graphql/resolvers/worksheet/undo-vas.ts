import { OrderVas, ORDER_VAS_STATUS } from '@things-factory/sales-base'
import { getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const undoVas = {
  async undoVas(_: any, { worksheetDetail }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const worksheetDetailName = worksheetDetail.name

      // Find worksheet detail by its name
      const foundWSD: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
        where: {
          domain: context.state.domain,
          name: worksheetDetailName,
          status: WORKSHEET_STATUS.DONE,
          type: WORKSHEET_TYPE.VAS
        },
        relations: ['worksheet', 'targetVas', 'targetVas.vas', 'targetVas.vasOrder', 'targetVas.inventory']
      })

      // Validate record existing
      if (!foundWSD) throw new Error("Worksheet doesn't exists")

      const targetVas: OrderVas = foundWSD.targetVas
      if (!targetVas) throw new Error("VAS doesn't exists")
      await trxMgr.getRepository(WorksheetDetail).save({
        ...foundWSD,
        status: WORKSHEET_STATUS.EXECUTING,
        issue: '',
        updater: context.state.user
      })

      // Update status of order vas
      await trxMgr.getRepository(OrderVas).save({
        ...targetVas,
        status: ORDER_VAS_STATUS.PROCESSING,
        updater: context.state.user
      })
      // }
    })
  }
}
