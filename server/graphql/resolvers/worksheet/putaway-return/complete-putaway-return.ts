import { User } from '@things-factory/auth-base'
import { ArrivalNotice, generateGoodsReceivalNote } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { PutawayReturningWorksheetController } from '../../../../controllers'
import { Worksheet } from '../../../../entities'

export const completePutawayReturnResolver = {
  async completePutawayReturn(_: any, { returnOrderNo }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await completePutawayReturn(trxMgr, domain, user, returnOrderNo)
    })
  }
}

export async function completePutawayReturn(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  returnOrderNo: string
): Promise<void> {
  const worksheetController: PutawayReturningWorksheetController = new PutawayReturningWorksheetController(trxMgr, domain, user)
  let worksheet: Worksheet = await worksheetController.completePutawayReturn(returnOrderNo)

  /**
   * 4. Generate the Goods Received Note straight away
   */
  if (!worksheet.returnOrder?.name || !worksheet.bizplace?.id) {
    worksheet = await trxMgr.getRepository(Worksheet).findOne(worksheet.id, {
      relations: ['bizplace', 'returnOrder']
    })
  }
}
