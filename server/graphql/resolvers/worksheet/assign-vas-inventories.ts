import { User } from '@things-factory/auth-base'
import { OrderNoGenerator, OrderVas } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { getManager } from 'typeorm'
import { WorksheetDetail } from '../../../entities'
import { WorksheetNoGenerator } from '../../../utils'

export const assignVasInventoriesResolver = {
  async assignVasInventories(_: any, { worksheetDetailId, inventories }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const worksheetDetail: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
        where: { id: worksheetDetailId },
        relations: ['worksheet', 'orderVas']
      })

      const domain: Domain = context.state.domain
      const user: User = context.state.user

      const orderVas: OrderVas = worksheetDetail.targetVas
      const prevOrderVasId: string = orderVas.id

      delete worksheetDetail.id

      for (let inv of inventories) {
        const { invId, qty } = inv
        let targetVas: OrderVas = { ...orderVas }
        delete targetVas.id

        // Create new order vas
        targetVas = await trxMgr.getRepository(OrderVas).save({
          ...targetVas,
          name: OrderNoGenerator.orderVas(),
          qty,
          creator: user,
          updater: user
        })

        // Create new worksheet detail
        await trxMgr.getRepository(WorksheetDetail).save({
          ...worksheetDetail,
          name: WorksheetNoGenerator.vasDetail(),
          targetVas,
          creator: user,
          updater: user
        })
      }

      // Delete previous order vas
      await trxMgr.getRepository(OrderVas).delete(prevOrderVasId)

      // Delete previous worksheet detail
      await trxMgr.getRepository(WorksheetDetail).delete(worksheetDetailId)
    })
  }
}
