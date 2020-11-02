import { User } from '@things-factory/auth-base'
import { Bizplace, getMyBizplace } from '@things-factory/biz-base'
import { ReturnOrder, generateGoodsReceivalNote } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory, INVENTORY_STATUS } from '@things-factory/warehouse-base'
import { EntityManager, getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../../constants'
import { PutawayReturningWorksheetController, UnloadingReturningWorksheetController } from '../../../../controllers'
import { Worksheet, WorksheetDetail } from '../../../../entities'

export const completeUnloadReturningResolver = {
  async completeUnloadReturning(_: any, { returnOrderNo, worksheetDetails }, context: any) {
    return await getManager().transaction(async (trxMgr: EntityManager) => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await completeUnloadReturning(trxMgr, domain, user, returnOrderNo, worksheetDetails)

      const returnOrder: ReturnOrder = await trxMgr.getRepository(ReturnOrder).findOne({
        where: { domain, name: returnOrderNo },
        relations: ['bizplace']
      })

      const putawayWSCtrl: PutawayReturningWorksheetController = new PutawayReturningWorksheetController(trxMgr, domain, user)
      let putawayWorksheet: Worksheet

      try {
        putawayWorksheet = await putawayWSCtrl.findWorksheetByRefOrder(returnOrderNo, WORKSHEET_TYPE.PUTAWAY_RETURN)
      } catch (e) {
        const inventories: Inventory[] = await trxMgr.getRepository(Inventory).find({
          where: { domain, refOrderId: returnOrder.id, status: INVENTORY_STATUS.UNLOADED }
        })
        putawayWorksheet = await putawayWSCtrl.generatePutawayReturnWorksheet(returnOrder.name, inventories)
      }

      if (putawayWorksheet.status === WORKSHEET_STATUS.DEACTIVATED) {
        await putawayWSCtrl.activatePutawayReturning(putawayWorksheet.name, putawayWorksheet.worksheetDetails)
      }

      const worksheetController: UnloadingReturningWorksheetController = new UnloadingReturningWorksheetController(trxMgr, domain, user)
      worksheetController.notifyToOfficeAdmin({
        title: `Unloading Completed`,
        message: `${returnOrderNo} is ready for putaway`,
        url: context.header.referer
      })
    })
  }
}

export async function completeUnloadReturning(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  returnOrderNo: string,
  outboundReturnWorksheetDetails: Partial<WorksheetDetail>[]
): Promise<void> {
  const worksheetController: UnloadingReturningWorksheetController = new UnloadingReturningWorksheetController(trxMgr, domain, user)
  await worksheetController.completeUnloadReturning(returnOrderNo, outboundReturnWorksheetDetails)
}
