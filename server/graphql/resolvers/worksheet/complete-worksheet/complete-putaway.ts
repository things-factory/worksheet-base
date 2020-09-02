import { User } from '@things-factory/auth-base'
import { ArrivalNotice, generateGoodsReceivalNote } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { InboundWorksheetController } from '../../../../controllers/inbound-worksheet-controller'
import { Worksheet } from '../../../../entities'

export const completePutawayResolver = {
  async completePutaway(_: any, { arrivalNoticeNo }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await completePutaway(trxMgr, domain, user, arrivalNoticeNo)
    })
  }
}

export async function completePutaway(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  arrivalNoticeNo: string
): Promise<void> {
  const worksheetController: InboundWorksheetController = new InboundWorksheetController(trxMgr)
  let worksheet: Worksheet = await worksheetController.completePutaway({ domain, user, arrivalNoticeNo })

  /**
   * 4. Generate the Goods Received Note straight away
   */
  if (!worksheet.arrivalNotice?.name || !worksheet.bizplace?.id) {
    worksheet = await trxMgr.getRepository(Worksheet).findOne(worksheet.id, {
      relations: ['bizplace', 'arrivalNotice']
    })
  }
  const arrivalNotice: ArrivalNotice = worksheet.arrivalNotice
  await generateGoodsReceivalNote({ refNo: arrivalNotice.name, customer: worksheet.bizplace.id }, domain, user, trxMgr)
}
