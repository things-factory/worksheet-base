import { User } from '@things-factory/auth-base'
import { ArrivalNotice } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { GenerateUnloadingInterface, WorksheetController } from '../../../../controllers/worksheet-controller'
import { Worksheet } from '../../../../entities'
import { generateReleaseGoodWorksheet } from './generate-release-good-worksheet'

export const generateArrivalNoticeWorksheetResolver = {
  async generateArrivalNoticeWorksheet(_: any, { arrivalNoticeNo, bufferLocation }, context: any) {
    return await getManager().transaction(async trxMgr => {
      let unloadingWorksheet = await generateArrivalNoticeWorksheet(trxMgr, arrivalNoticeNo, bufferLocation, context)

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
        await generateReleaseGoodWorksheet(trxMgr, arrivalNotice.releaseGood.name, context)
      }

      const vasWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
        where: { domain: context.state.domain, arrivalNotice }
      })

      return { unloadingWorksheet, vasWorksheet }
    })
  }
}

async function generateArrivalNoticeWorksheet(
  trxMgr: EntityManager,
  arrivalNoticeNo: string,
  bufferLocation: { id: string },
  context: any
): Promise<Worksheet> {
  const { domain, user }: { domain: Domain; user: User } = context.state

  const worksheetController: WorksheetController = new WorksheetController(trxMgr)
  return await worksheetController.generate({
    domain,
    user,
    arrivalNoticeNo,
    bufferLocationId: bufferLocation.id
  } as GenerateUnloadingInterface)
}
