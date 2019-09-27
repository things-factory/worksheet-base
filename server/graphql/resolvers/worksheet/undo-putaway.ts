import { Inventory, Location } from '@things-factory/warehouse-base'
import { getManager, getRepository } from 'typeorm'
import { WorksheetDetail } from '../../../entities'
import { WORKSHEET_STATUS } from '../../../enum'

export const undoPutaway = {
  async undoPutaway(_: any, { worksheetDetail, inventory }, context: any) {
    return await getManager().transaction(async () => {
      const worksheetDetailName = worksheetDetail.name
      const palletId = inventory.palletId

      // 1. update status of worksheetDetail (DONE => EXECUTING)
      const foundWorksheetDetail: WorksheetDetail = await getRepository(WorksheetDetail).findOne({
        where: { domain: context.state.domain, name: worksheetDetailName, status: WORKSHEET_STATUS.DONE },
        relations: ['bizplace', 'fromLocation', 'toLocation']
      })

      if (!foundWorksheetDetail) throw new Error("Worksheet doesn't exists")

      await getRepository(WorksheetDetail).save({
        ...foundWorksheetDetail,
        status: WORKSHEET_STATUS.EXECUTING
      })

      // 2. update inventory from shelf location to buffer location
      const targetInventory: Inventory = await getRepository(Inventory).findOne({
        where: { domain: context.state.domain, palletId, location: foundWorksheetDetail.toLocation }
      })

      return await getRepository(Inventory).save({
        ...targetInventory,
        location: await getRepository(Location).findOne({
          where: { domain: context.state.domain, name: foundWorksheetDetail.fromLocation.name }
        }),
        updater: context.state.user
      })
    })
  }
}
