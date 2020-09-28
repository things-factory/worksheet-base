import { OrderInventory, ORDER_STATUS, InventoryCheck } from '@things-factory/sales-base'
import { Inventory } from '@things-factory/warehouse-base'
import { getRepository, createQueryBuilder, SelectQueryBuilder } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const cycleCountWorksheetResolver = {
  async cycleCountWorksheet(_: any, { inventoryCheckNo, locationSortingRules }, context: any) {
    const cycleCount: InventoryCheck = await getRepository(InventoryCheck).findOne({
      where: { domain: context.state.domain, name: inventoryCheckNo, status: ORDER_STATUS.INSPECTING }
    })

    if (!cycleCount) throw new Error('Failed to find cycle count worksheet')

    const worksheet: Worksheet = await getRepository(Worksheet).findOne({
      where: {
        domain: context.state.domain,
        inventoryCheck: cycleCount,
        type: WORKSHEET_TYPE.CYCLE_COUNT,
        status: WORKSHEET_STATUS.EXECUTING
      }
    })

    const qb: SelectQueryBuilder<WorksheetDetail> = createQueryBuilder(WorksheetDetail, 'WSD')
    qb.leftJoinAndSelect('WSD.targetInventory', 'T_INV')
      .leftJoinAndSelect('T_INV.inventory', 'INV')
      .leftJoinAndSelect('T_INV.inspectedLocation', 'INS_LOC')
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
        startedAt: worksheet.startedAt
      },
      worksheetDetailInfos: worksheetDetails.map(async (cycleCountWSD: WorksheetDetail) => {
        const targetInventory: OrderInventory = cycleCountWSD.targetInventory
        const inventory: Inventory = targetInventory.inventory

        return {
          name: cycleCountWSD.name,
          palletId: inventory?.palletId,
          batchId: inventory?.batchId,
          product: inventory?.product,
          qty: inventory?.qty,
          weight: inventory?.weight,
          inspectedQty: targetInventory.inspectedQty,
          inspectedWeight: targetInventory.inspectedWeight,
          inspectedLocation: targetInventory.inspectedLocation,
          status: cycleCountWSD.status,
          targetName: targetInventory.name,
          packingType: inventory?.packingType,
          location: inventory?.location,
          relatedOrderInv: targetInventory
        }
      })
    }
  }
}
