import { OrderInventory, ORDER_STATUS, ReleaseGood } from '@things-factory/sales-base'
import { Inventory } from '@things-factory/warehouse-base'
import { getRepository, createQueryBuilder, SelectQueryBuilder } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const pickingWorksheetResolver = {
  async pickingWorksheet(_: any, { releaseGoodNo, locationSortingRules }, context: any) {
    const releaseGood: ReleaseGood = await getRepository(ReleaseGood).findOne({
      where: { domain: context.state.domain, name: releaseGoodNo, status: ORDER_STATUS.PICKING },
      relations: ['bizplace']
    })

    const worksheet: Worksheet = await getRepository(Worksheet).findOne({
      where: {
        domain: context.state.domain,
        releaseGood,
        bizplace: releaseGood.bizplace,
        type: WORKSHEET_TYPE.PICKING,
        status: WORKSHEET_STATUS.EXECUTING
      },
      relations: ['bizplace']
    })

    const qb: SelectQueryBuilder<WorksheetDetail> = createQueryBuilder(WorksheetDetail, 'WSD')
    qb.leftJoinAndSelect('WSD.targetInventory', 'T_INV')
      .leftJoinAndSelect('T_INV.inventory', 'INV')
      .leftJoinAndSelect('INV.location', 'LOC')
      .leftJoinAndSelect('INV.product', 'PROD')

    if (locationSortingRules?.length > 0) {
      locationSortingRules.forEach((rule: { name: string; desc: boolean }) => {
        qb.addOrderBy(`LOC.${rule.name}`, rule.desc ? 'DESC' : 'ASC')
      })
    }

    const worksheetDetails: WorksheetDetail[] = await qb
      .where('"WSD"."worksheet_id" = :worksheetId', { worksheetId: worksheet.id })
      .andWhere('"WSD"."status" != :status', { status: WORKSHEET_STATUS.REPLACED })
      .getMany()

    return {
      worksheetInfo: {
        bizplaceName: releaseGood.bizplace.name,
        startedAt: worksheet.startedAt,
        refNo: releaseGood.refNo
      },
      worksheetDetailInfos: worksheetDetails.map(async (pickingWSD: WorksheetDetail) => {
        const targetInventory: OrderInventory = pickingWSD.targetInventory
        const inventory: Inventory = targetInventory.inventory
        return {
          name: pickingWSD.name,
          palletId: inventory.palletId,
          batchId: inventory.batchId,
          product: inventory.product,
          qty: inventory.qty,
          releaseQty: targetInventory.releaseQty,
          status: pickingWSD.status,
          description: pickingWSD.description,
          targetName: targetInventory.name,
          packingType: inventory.packingType,
          location: inventory.location
        }
      })
    }
  }
}
