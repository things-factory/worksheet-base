import { OrderProduct } from '@things-factory/sales-base'
import { Inventory } from '@things-factory/warehouse-base'
import { getManager, getRepository } from 'typeorm'
import { WorksheetDetail } from '../../../entities'
import { INVENTORY_STATUS, WORKSHEET_STATUS, ORDER_PRODUCT_STATUS } from '../../../enum'

export const undoUnloading = {
  async undoUnloading(_: any, { worksheetDetailName, palletId }, context: any) {
    return await getManager().transaction(async () => {
      const foundWorksheetDetail: WorksheetDetail = await getRepository(WorksheetDetail).findOne({
        where: { domain: context.state.domain, name: worksheetDetailName, status: WORKSHEET_STATUS.DONE },
        relations: ['bizplace', 'fromLocation', 'toLocation', 'targetProduct']
      })

      if (!foundWorksheetDetail) throw new Error("Worksheet doesn't exists")

      const inventory: Inventory = await getRepository(Inventory).findOne({
        domain: context.state.domain,
        status: INVENTORY_STATUS.OCCUPIED,
        palletId
      })

      await getRepository(Inventory).delete(inventory.id)

      await getRepository(OrderProduct).save({
        ...foundWorksheetDetail.targetProduct,
        actualPackQty: foundWorksheetDetail.targetProduct.actualPackQty - inventory.qty,
        actualPalletQty: foundWorksheetDetail.targetProduct.actualPalletQty - 1,
        status: ORDER_PRODUCT_STATUS.UNLOADING,
        updater: context.state.user
      })

      await getRepository(WorksheetDetail).save({
        ...foundWorksheetDetail,
        status: WORKSHEET_STATUS.EXECUTING,
        updater: context.state.user
      })
    })
  }
}
