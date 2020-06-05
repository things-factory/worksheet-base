import { OrderInventory } from '@things-factory/sales-base'
import { EntityManager, getManager } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const undoPickingAssigmentResolver = {
  async undoPickingAssigment(_: any, { worksheetNo, batchId, productName, packingType }, context: any): Promise<void> {
    return await getManager().transaction(async (trxMgr: EntityManager) => {
      const worksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
        where: { name: worksheetNo, domain: context.state.domain },
        relations: ['bizplace', 'releaseGood', 'worksheetDetails', 'worksheetDetails.targetInventory']
      })
      const worksheetDetails: WorksheetDetail[] = worksheet.worksheetDetails.filter(
        (wsd: WorksheetDetail) =>
          wsd.targetInventory.batchId === batchId &&
          wsd.targetInventory.productName === productName &&
          wsd.targetInventory.packingType === packingType
      )

      const wsdIds: string[] = worksheetDetails.map((wsd: WorksheetDetail) => wsd.id)
      const orderInvIds: string[] = worksheetDetails.map((wsd: WorksheetDetail) => wsd.targetInventory.id)

      await trxMgr.getRepository(WorksheetDetail).delete(wsdIds)
      await trxMgr.getRepository(OrderInventory).delete(orderInvIds)
    })
  }
}