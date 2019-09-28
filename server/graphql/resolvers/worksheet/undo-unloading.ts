import { Bizplace } from '@things-factory/sales-base'
import { getRepository, getManager, In } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { WORKSHEET_STATUS, INVENTORY_STATUS, WORKSHEET_TYPE } from '../../../enum'
import { Inventory } from '@things-factory/warehouse-base'

export const undoUnloading = {
  async undoUnloading(_: any, { worksheetDetailName, palletId }, context: any) {
    return await getManager().transaction(async () => {
      const foundWorksheetDetail: WorksheetDetail = await getRepository(WorksheetDetail).findOne({
        where: { domain: context.state.domain, name: worksheetDetailName, status: WORKSHEET_STATUS.DONE },
        relations: ['bizplace', 'fromLocation', 'toLocation']
      })

      if (!foundWorksheetDetail) throw new Error("Worksheet doesn't exists")

      await getRepository(Inventory).delete({
        domain: context.state.domain,
        status: INVENTORY_STATUS.OCCUPIED,
        palletId
      })

      await getRepository(WorksheetDetail).save({
        ...foundWorksheetDetail,
        status: WORKSHEET_STATUS.EXECUTING,
        updater: context.state.user
      })
    })
  }
}
