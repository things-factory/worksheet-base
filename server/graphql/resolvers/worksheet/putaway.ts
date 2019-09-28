import { Inventory, Location } from '@things-factory/warehouse-base'
import { getManager, getRepository } from 'typeorm'
import { WorksheetDetail } from '../../../entities'
import { WORKSHEET_STATUS } from '../../../enum'

export const putaway = {
  async putaway(_: any, { worksheetDetail, inventory }, context: any) {
    return await getManager().transaction(async () => {
      const worksheetDetailName = worksheetDetail.name
      const toLocationName = worksheetDetail.toLocation.name
      const palletId = inventory.palletId

      // 1. update status of worksheetDetail (EXECUTING => DONE)
      const foundWorksheetDetail: WorksheetDetail = await getRepository(WorksheetDetail).findOne({
        where: { domain: context.state.domain, name: worksheetDetailName, status: WORKSHEET_STATUS.EXECUTING },
        relations: ['bizplace', 'toLocation']
      })

      if (!foundWorksheetDetail) throw new Error("Worksheet doesn't exists")

      await getRepository(WorksheetDetail).save({
        ...foundWorksheetDetail,
        status: WORKSHEET_STATUS.DONE
      })

      // 2. update inventory from buffer location to shelf location
      const targetInventory: Inventory = await getRepository(Inventory).findOne({
        where: { domain: context.state.domain, palletId }
      })

      await getRepository(Inventory).save({
        ...targetInventory,
        location: await getRepository(Location).findOne({ domain: context.state.domain, name: toLocationName }),
        updater: context.state.user
      })
    })
  }
}
