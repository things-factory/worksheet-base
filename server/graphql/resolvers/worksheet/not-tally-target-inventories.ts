import { InventoryCheck, ORDER_INVENTORY_STATUS } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { createQueryBuilder, getRepository, SelectQueryBuilder } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const notTallyTargetInventoriesResolver = {
  async notTallyTargetInventories(_: any, { cycleCountNo }, context: any) {
    const { domain }: { domain: Domain } = context.state

    const cycleCount: InventoryCheck = await getRepository(InventoryCheck).findOne({
      where: { domain, name: cycleCountNo }
    })

    const worksheet: Worksheet = await getRepository(Worksheet).findOne({
      where: { domain, inventoryCheck: cycleCount }
    })

    const qb: SelectQueryBuilder<WorksheetDetail> = createQueryBuilder(WorksheetDetail, 'WSD')
    const worksheetDetails: WorksheetDetail[] = await qb
      .leftJoinAndSelect('WSD.targetInventory', 'T_INV')
      .leftJoinAndSelect('T_INV.inventory', 'INV')
      .leftJoinAndSelect('T_INV.originLocation', 'ORG_LOC')
      .leftJoinAndSelect('T_INV.inspectedLocation', 'ISP_LOC')
      .leftJoinAndSelect('INV.product', 'PROD')
      .where('WSD.domain = :domainId', { domainId: domain.id })
      .andWhere('WSD.worksheet = :worksheetId', { worksheetId: worksheet.id })
      .andWhere('T_INV.status = :status', { status: ORDER_INVENTORY_STATUS.NOT_TALLY })
      .getMany()

    return worksheetDetails.map((wsd: WorksheetDetail) => wsd.targetInventory)
  }
}
