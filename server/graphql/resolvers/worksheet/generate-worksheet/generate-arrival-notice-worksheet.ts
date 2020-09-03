import { User } from '@things-factory/auth-base'
import { ArrivalNotice } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { PickingWorksheetController, UnloadingWorksheetController } from '../../../../controllers'
import { Worksheet } from '../../../../entities'

export const generateArrivalNoticeWorksheetResolver = {
  async generateArrivalNoticeWorksheet(_: any, { arrivalNoticeNo, bufferLocation }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      let unloadingWorksheet = await generateUnloadingWorksheet(trxMgr, domain, user, arrivalNoticeNo, bufferLocation)

      if (!unloadingWorksheet.arrivalNotice?.id) {
        unloadingWorksheet = await trxMgr.getRepository(Worksheet).findOne({
          where: unloadingWorksheet,
          relations: ['arrivalNotice']
        })
      }

      let arrivalNotice: ArrivalNotice = unloadingWorksheet.arrivalNotice
      const crossDocking: boolean = unloadingWorksheet.arrivalNotice.crossDocking

      if (crossDocking) {
        arrivalNotice = await trxMgr
          .getRepository(ArrivalNotice)
          .findOne({ where: { domain: context.state.domain, name: arrivalNoticeNo }, relations: ['releaseGood'] })

        const releaseGoodNo: string = arrivalNotice.releaseGood.name
        const pickingWSCtrl: PickingWorksheetController = new PickingWorksheetController(trxMgr, domain, user)
        await pickingWSCtrl.generatePickingWorksheet(releaseGoodNo)
      }

      const vasWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
        where: { domain: context.state.domain, arrivalNotice }
      })

      return { unloadingWorksheet, vasWorksheet }
    })
  }
}

async function generateUnloadingWorksheet(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  arrivalNoticeNo: string,
  bufferLocation: { id: string }
): Promise<Worksheet> {
  const worksheetController: UnloadingWorksheetController = new UnloadingWorksheetController(trxMgr, domain, user)
  return await worksheetController.generateUnloadingWorksheet(arrivalNoticeNo, bufferLocation.id)
}
