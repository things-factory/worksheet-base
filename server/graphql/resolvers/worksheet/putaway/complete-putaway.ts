import { User } from '@things-factory/auth-base'
import { ArrivalNotice, generateGoodsReceivalNote } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { PutawayWorksheetController } from '../../../../controllers'
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
  const worksheetController: PutawayWorksheetController = new PutawayWorksheetController(trxMgr, domain, user)
  let worksheet: Worksheet = await worksheetController.completePutaway(arrivalNoticeNo)

  /**
   * 4. Generate the Goods Received Note straight away
   */
  if (!worksheet.arrivalNotice?.name || !worksheet.bizplace?.id) {
    worksheet = await trxMgr.getRepository(Worksheet).findOne(worksheet.id, {
      relations: ['bizplace', 'arrivalNotice']
    })
  }
}
