import { Bizplace } from '@things-factory/biz-base'
import { OrderNoGenerator, OrderVas } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory } from '@things-factory/warehouse-base'
import { getManager, In } from 'typeorm'
import { WorksheetDetail } from '../../../entities'
import { WorksheetNoGenerator } from '../../../utils'

export const assignVasInventoriesResolver = {
  async assignVasInventories(_: any, { worksheetDetailIds, inventories }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const worksheetDetails: WorksheetDetail[] = await trxMgr.getRepository(WorksheetDetail).find({
        where: { id: In(worksheetDetailIds) },
        relations: [
          'domain',
          'bizplace',
          'worksheet',
          'targetVas',
          'targetVas.arrivalNotice',
          'targetVas.releaseGood',
          'targetVas.shippingOrder',
          'targetVas.vasOrder',
          'targetVas.vas',
          'targetVas.targetProduct'
        ]
      })

      let seq: number = 0 // Sequance for VAS order

      for (let worksheetDetail of worksheetDetails) {
        const worksheetDetailId = worksheetDetail.id
        const orderVas: OrderVas = worksheetDetail.targetVas
        const prevOrderVasId: string = orderVas.id
        const domain: Domain = context.state.domain
        const bizplace: Bizplace = worksheetDetail.bizplace

        delete worksheetDetail.id

        for (let inv of inventories) {
          let targetVas: OrderVas = { ...orderVas }
          delete targetVas.id

          const inventory: Inventory = await trxMgr.getRepository(Inventory).findOne(inv.id)
          const unitWeight: number = inventory.weight / inventory.qty
          // Create new order vas
          targetVas = await trxMgr.getRepository(OrderVas).save({
            ...targetVas,
            domain,
            bizplace,
            name: OrderNoGenerator.orderVas(),
            qty: inv.qty,
            weight: inv.qty * unitWeight,
            inventory,
            creator: context.state.user,
            updater: context.state.user
          })

          // Create new worksheet detail
          await trxMgr.getRepository(WorksheetDetail).save({
            ...worksheetDetail,
            domain,
            bizplace,
            name: WorksheetNoGenerator.vasDetail(),
            seq,
            targetVas,
            creator: context.state.user,
            updater: context.state.user
          })

          seq++
        }

        // Delete previous worksheet detail
        await trxMgr.getRepository(WorksheetDetail).delete(worksheetDetailId)

        // Delete previous order vas
        await trxMgr.getRepository(OrderVas).delete(prevOrderVasId)
      }
    })
  }
}
