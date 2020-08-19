import { ArrivalNotice, Bizplace } from '@things-factory/sales-base'
import { Inventory, INVENTORY_STATUS } from '@things-factory/warehouse-base'
import { getRepository, In } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { WorksheetDetail } from '../../../entities'

export const unloadedInventories = {
  async unloadedInventories(_: any, { worksheetDetailName }, context: any) {
    const foundWorksheetDetail: WorksheetDetail = await getRepository(WorksheetDetail).findOne({
      where: {
        domain: context.state.domain,
        name: worksheetDetailName,
        type: WORKSHEET_TYPE.UNLOADING,
        status: In([WORKSHEET_STATUS.EXECUTING, WORKSHEET_STATUS.PARTIALLY_UNLOADED])
      },
      relations: ['bizplace', 'targetProduct', 'worksheet', 'worksheet.arrivalNotice', 'worksheet.bufferLocation']
    })

    if (!foundWorksheetDetail) return []

    const arrivalNotice: ArrivalNotice = foundWorksheetDetail.worksheet.arrivalNotice
    const customerBizplace: Bizplace = foundWorksheetDetail.bizplace
    return await getRepository(Inventory).find({
      where: {
        domain: context.state.domain,
        bizplace: customerBizplace,
        refOrderId: arrivalNotice.id,
        batchId: foundWorksheetDetail.targetProduct.batchId,
        location: foundWorksheetDetail.worksheet.bufferLocation,
        orderProductId: foundWorksheetDetail.targetProduct.id,
        status: INVENTORY_STATUS.UNLOADED
      },
      relations: ['reusablePallet']
    })
  }
}
