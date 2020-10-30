import { User } from '@things-factory/auth-base'
import { ReturnOrder } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { OutboundReturningWorksheetController } from '../../../../controllers'
import { Worksheet } from '../../../../entities'

export const generateReturnOrderWorksheetResolver = {
  async generateReturnOrderWorksheet(_: any, { returnOrderNo, bufferLocation }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      let outboundReturningWorksheet = await generateOutboundReturningWorksheet(
        trxMgr,
        domain,
        user,
        returnOrderNo,
        bufferLocation
      )

      if (!outboundReturningWorksheet.returnOrder?.id) {
        outboundReturningWorksheet = await trxMgr.getRepository(Worksheet).findOne({
          where: outboundReturningWorksheet,
          relations: ['returnOrder']
        })
      }

      let returnOrder: ReturnOrder = outboundReturningWorksheet.returnOrder

      const vasWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
        where: { domain: context.state.domain, returnOrder }
      })

      return { outboundReturningWorksheet, vasWorksheet }
    })
  }
}

async function generateOutboundReturningWorksheet(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  returnOrderNo: string,
  bufferLocation: { id: string }
): Promise<Worksheet> {
  const worksheetController: OutboundReturningWorksheetController = new OutboundReturningWorksheetController(
    trxMgr,
    domain,
    user
  )
  return await worksheetController.generateOutboundReturningWorksheet(returnOrderNo, bufferLocation.id)
}
