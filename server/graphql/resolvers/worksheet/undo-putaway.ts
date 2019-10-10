import { Inventory, Location } from '@things-factory/warehouse-base'
import { getManager } from 'typeorm'
import { WORKSHEET_STATUS } from '../../../constants'
import { WorksheetDetail } from '../../../entities'

export const undoPutaway = {
  async undoPutaway(_: any, { worksheetDetail, inventory }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const worksheetDetailName = worksheetDetail.name
      const palletId = inventory.palletId

      // 1. update status of worksheetDetail (DONE => EXECUTING)
      const foundWorksheetDetail: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
        where: { domain: context.state.domain, name: worksheetDetailName, status: WORKSHEET_STATUS.DONE },
        relations: ['bizplace', 'fromLocation', 'toLocation']
      })

      if (!foundWorksheetDetail) throw new Error("Worksheet doesn't exists")

      await trxMgr.getRepository(WorksheetDetail).save({
        ...foundWorksheetDetail,
        status: WORKSHEET_STATUS.EXECUTING
      })

      // 2. update inventory from shelf location to buffer location
      const targetInventory: Inventory = await trxMgr.getRepository(Inventory).findOne({
        where: { domain: context.state.domain, palletId }
      })

      await trxMgr.getRepository(Inventory).save({
        ...targetInventory,
        location: await trxMgr.getRepository(Location).findOne({
          where: { domain: context.state.domain, name: foundWorksheetDetail.fromLocation.name }
        }),
        updater: context.state.user
      })
    })
  }
}
