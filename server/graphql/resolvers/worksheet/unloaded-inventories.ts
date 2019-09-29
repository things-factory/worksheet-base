import { Bizplace } from '@things-factory/sales-base'
import { Inventory, INVENTORY_STATUS } from '@things-factory/warehouse-base'
import { getRepository } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { WorksheetDetail } from '../../../entities'

export const unloadedInventories = {
  async unloadedInventories(_: any, { worksheetDetailName }, context: any) {
    const foundWorksheetDetail: WorksheetDetail = await getRepository(WorksheetDetail).findOne({
      where: {
        domain: context.state.domain,
        name: worksheetDetailName,
        type: WORKSHEET_TYPE.UNLOADING,
        status: WORKSHEET_STATUS.EXECUTING
      },
      relations: ['bizplace', 'targetProduct', 'worksheet', 'worksheet.bufferLocation']
    })

    if (!foundWorksheetDetail) return []

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
