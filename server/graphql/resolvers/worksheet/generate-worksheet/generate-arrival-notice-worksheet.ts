import { User } from '@things-factory/auth-base'
import { ArrivalNotice } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { InboundWorksheetController } from 'server/controllers/inbound-worksheet-controller'
import { EntityManager, getManager } from 'typeorm'
import { Worksheet } from '../../../../entities'
import { generateReleaseGoodWorksheet } from './generate-release-good-worksheet'

export const generateArrivalNoticeWorksheetResolver = {
  async generateArrivalNoticeWorksheet(_: any, { arrivalNoticeNo, bufferLocation }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      let unloadingWorksheet = await generateArrivalNoticeWorksheet(
        trxMgr,
        domain,
        user,
        arrivalNoticeNo,
        bufferLocation
      )

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
        await generateReleaseGoodWorksheet(trxMgr, domain, user, arrivalNotice.releaseGood.name)
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
  domain: Domain,
  user: User,
  arrivalNoticeNo: string,
  bufferLocation: { id: string }
): Promise<Worksheet> {
  const worksheetController: InboundWorksheetController = new InboundWorksheetController(trxMgr)
  return await worksheetController.generateUnloadingWorksheet({
    domain,
    user,
    arrivalNoticeNo,
    bufferLocationId: bufferLocation.id
  })
}
