import { Bizplace } from '@things-factory/biz-base'
import { OrderNoGenerator, OrderVas } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory } from '@things-factory/warehouse-base'
import { getManager } from 'typeorm'
import { WorksheetDetail } from '../../../entities'
import { WorksheetNoGenerator } from '../../../utils'

export const assignVasInventoriesResolver = {
  async assignVasInventories(_: any, { worksheetDetailId, inventories }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const worksheetDetail: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
        where: { id: worksheetDetailId },
        relations: [
          'domain',
          'bizplace',
          'worksheet',
          'targetVas',
          'targetVas.targetProduct',
          'targetVas.arrivalNotice',
          'targetVas.releaseGood',
          'targetVas.shippingOrder',
          'targetVas.vasOrder',
          'targetVas.vas'
        ]
      })

      const orderVas: OrderVas = worksheetDetail.targetVas
      const prevOrderVasId: string = orderVas.id
      const domain: Domain = context.state.domain
      const bizplace: Bizplace = worksheetDetail.bizplace

      delete worksheetDetail.id

      for (let inv of inventories) {
        const { invId, qty } = inv
        let targetVas: OrderVas = { ...orderVas }
        delete targetVas.id

        // Create new order vas
        targetVas = await trxMgr.getRepository(OrderVas).save({
          ...targetVas,
          domain,
          bizplace,
          name: OrderNoGenerator.orderVas(),
          qty,
          inventory: await trxMgr.getRepository(Inventory).findOne(invId),
          creator: context.state.user,
          updater: context.state.user
        })

        // Create new worksheet detail
        await trxMgr.getRepository(WorksheetDetail).save({
          ...worksheetDetail,
          domain,
          bizplace,
          name: WorksheetNoGenerator.vasDetail(),
          targetVas,
          creator: context.state.user,
          updater: context.state.user
        })
      }

      // Delete previous worksheet detail
      await trxMgr.getRepository(WorksheetDetail).delete(worksheetDetailId)

      // Delete previous order vas
      await trxMgr.getRepository(OrderVas).delete(prevOrderVasId)
    })
  }
}
