import { Bizplace } from '@things-factory/sales-base'
import { getRepository, In } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { WORKSHEET_STATUS, INVENTORY_STATUS } from '../../../enum'
import { Inventory } from '@things-factory/warehouse-base'

export const unloadedInventories = {
  async unloadedInventories(_: any, { worksheetDetailName }, context: any) {
    const foundWorksheetDetail: WorksheetDetail = await getRepository(WorksheetDetail).findOne({
      where: {
        domain: context.state.domain,
        name: worksheetDetailName,
        status: WORKSHEET_STATUS.EXECUTING
      },
      relations: ['bizplace', 'targetProduct', 'worksheet', 'worksheet.bufferLocation']
    })

    if (!foundWorksheetDetail) throw new Error(`WorksheetDetail doesn't exist`)
    const customerBizplace: Bizplace = foundWorksheetDetail.bizplace

    return await getRepository(Inventory).find({
      where: {
        domain: context.state.domain,
        bizplace: customerBizplace,
        batchId: foundWorksheetDetail.targetProduct.batchId,
        location: foundWorksheetDetail.worksheet.bufferLocation,
        status: INVENTORY_STATUS.OCCUPIED
      }
    })
  }
}
