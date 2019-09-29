import { Inventory, Location } from '@things-factory/warehouse-base'
import { getManager, getRepository } from 'typeorm'
import { WorksheetDetail } from '../../../entities'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../enum'

export const putaway = {
  async putaway(_: any, { worksheetDetail, inventory }, context: any) {
    return await getManager().transaction(async () => {
      const toLocation: Location = await getRepository(Location).findOne({
        domain: context.state.domain,
        name: worksheetDetail.toLocation.name
      })

      // 1. validity of location
      if (!toLocation) throw new Error('Location is not valid')

      const worksheetDetailName = worksheetDetail.name
      const palletId = inventory.palletId

      // 1. find worksheetDetail
      const foundWorksheetDetail: WorksheetDetail = await getRepository(WorksheetDetail).findOne({
        where: {
          domain: context.state.domain,
          name: worksheetDetailName,
          status: WORKSHEET_STATUS.EXECUTING,
          type: WORKSHEET_TYPE.PUTAWAY
        },
        relations: ['bizplace', 'toLocation']
      })

      if (!foundWorksheetDetail) throw new Error("Worksheet doesn't exists")

      // 2. update inventory from buffer location to shelf location
      const targetInventory: Inventory = await getRepository(Inventory).findOne({
        where: { domain: context.state.domain, palletId }
      })

      await getRepository(Inventory).save({
        ...targetInventory,
        location: toLocation,
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
