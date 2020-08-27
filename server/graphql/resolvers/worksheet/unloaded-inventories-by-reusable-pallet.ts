import { ArrivalNotice, Bizplace } from '@things-factory/sales-base'
import { Inventory, INVENTORY_STATUS, Pallet } from '@things-factory/warehouse-base'
import { getRepository, In } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { WorksheetDetail } from '../../../entities'

export const unloadedInventoriesByReusablePallet = {
  async unloadedInventoriesByReusablePallet(_: any, { reusablePalletId, worksheetDetailName }, context: any) {
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

    let foundReusablePallet: Pallet

    foundReusablePallet = await getRepository(Pallet).findOne({
      where: {
        domain: context.state.domain,
        name: reusablePalletId
      },
      relations: ['domain']
    })

    let arrivalNotice: ArrivalNotice = foundWorksheetDetail.worksheet.arrivalNotice
    let customerBizplace: Bizplace = foundWorksheetDetail.bizplace
    return await getRepository(Inventory).find({
      where: {
        domain: context.state.domain,
        bizplace: customerBizplace,
        batchId: foundWorksheetDetail.targetProduct.batchId,
        refOrderId: arrivalNotice.id,
        reusablePallet: foundReusablePallet,
        status: INVENTORY_STATUS.UNLOADED
      },
      relations: ['reusablePallet', 'product']
    })
  }
}
