import { User } from '@things-factory/auth-base'
import { Bizplace, getMyBizplace } from '@things-factory/biz-base'
import { ArrivalNotice, generateGoodsReceivalNote } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory, INVENTORY_STATUS } from '@things-factory/warehouse-base'
import { EntityManager, getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../../constants'
import { PutawayWorksheetController, UnloadingWorksheetController } from '../../../../controllers'
import { Worksheet, WorksheetDetail } from '../../../../entities'

export const completeUnloadingResolver = {
  async completeUnloading(_: any, { arrivalNoticeNo, worksheetDetails }, context: any) {
    return await getManager().transaction(async (trxMgr: EntityManager) => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await completeUnloading(trxMgr, domain, user, arrivalNoticeNo, worksheetDetails)

      const arrivalNotice: ArrivalNotice = await trxMgr.getRepository(ArrivalNotice).findOne({
        where: { domain, name: arrivalNoticeNo },
        relations: ['bizplace']
      })

      const putawayWSCtrl: PutawayWorksheetController = new PutawayWorksheetController(trxMgr, domain, user)
      let putawayWorksheet: Worksheet

      try {
        putawayWorksheet = await putawayWSCtrl.findWorksheetByRefOrder(arrivalNotice, WORKSHEET_TYPE.PUTAWAY)
      } catch (e) {
        const inventories: Inventory[] = await trxMgr.getRepository(Inventory).find({
          where: { domain, refOrderId: arrivalNotice.id, status: INVENTORY_STATUS.UNLOADED }
        })
        putawayWorksheet = await putawayWSCtrl.generatePutawayWorksheet(arrivalNotice.name, inventories)
      }

      if (putawayWorksheet.status === WORKSHEET_STATUS.DEACTIVATED) {
        await putawayWSCtrl.activatePutaway(putawayWorksheet.name, putawayWorksheet.worksheetDetails)
      }

      const bizplaceId: Bizplace = arrivalNotice.bizplace.id
      await generateGoodsReceivalNote({ refNo: arrivalNoticeNo, customer: bizplaceId }, domain, user, trxMgr)

      const worksheetController: UnloadingWorksheetController = new UnloadingWorksheetController(trxMgr, domain, user)
      worksheetController.notifyToOfficeAdmin({
        title: `Unloading Completed`,
        message: `${arrivalNoticeNo} is ready for putaway`,
        url: context.header.referer
      })
    })
  }
}

export async function completeUnloading(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  arrivalNoticeNo: string,
  unloadingWorksheetDetails: Partial<WorksheetDetail>[]
): Promise<void> {
  const worksheetController: UnloadingWorksheetController = new UnloadingWorksheetController(trxMgr, domain, user)
  await worksheetController.completeUnloading(arrivalNoticeNo, unloadingWorksheetDetails)
}
