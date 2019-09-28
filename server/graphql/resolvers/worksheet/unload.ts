import { Bizplace } from '@things-factory/biz-base'
import { Inventory } from '@things-factory/warehouse-base'
import { InventoryNoGenerator } from '../../../utils/inventory-no-generator'
import { getManager, getRepository } from 'typeorm'
import { WorksheetDetail } from '../../../entities'
import { INVENTORY_STATUS, WORKSHEET_STATUS } from '../../../enum'

export const unload = {
  async unload(_: any, { worksheetDetail, inventory }, context: any) {
    return await getManager().transaction(async () => {
      const worksheetDetailName = worksheetDetail.name
      const palletId = inventory.palletId
      const qty = inventory.qty

      // 1. find worksheet detail
      const foundWorksheetDetail: WorksheetDetail = await getRepository(WorksheetDetail).findOne({
        where: {
          domain: context.state.domain,
          name: worksheetDetailName,
          status: WORKSHEET_STATUS.EXECUTING
        },
        relations: [
          'bizplace',
          'targetProduct',
          'targetProduct.product',
          'worksheet',
          'worksheet.bufferLocation',
          'worksheet.bufferLocation.warehouse'
        ]
      })

      if (!foundWorksheetDetail) throw new Error(`WorksheetDetail doesn't exists`)
      const customerBizplace: Bizplace = foundWorksheetDetail.bizplace

      // 2. Create new inventory data
      await getRepository(Inventory).save({
        domain: context.state.domain,
        bizplace: customerBizplace,
        name: InventoryNoGenerator.inventoryName(),
        palletId: palletId,
        qty: qty,
        product: foundWorksheetDetail.targetProduct.product,
        packingType: foundWorksheetDetail.targetProduct.packingType,
        warehouse: foundWorksheetDetail.worksheet.bufferLocation.warehouse,
        location: foundWorksheetDetail.worksheet.bufferLocation,
        zone: foundWorksheetDetail.worksheet.bufferLocation.zone,
        status: INVENTORY_STATUS.OCCUPIED,
        creator: context.state.user,
        updater: context.state.user
      })

      // 3. update status of worksheetDetail (EXECUTING => DONE)
      await getRepository(WorksheetDetail).save({
        ...foundWorksheetDetail,
        status: WORKSHEET_STATUS.DONE,
        updater: context.state.user
      })
    })
  }
}
