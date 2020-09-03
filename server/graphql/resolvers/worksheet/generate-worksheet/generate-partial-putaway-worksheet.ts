import { User } from '@things-factory/auth-base'
import { ArrivalNotice } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory, INVENTORY_STATUS } from '@things-factory/warehouse-base'
import { EntityManager, getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../../constants'
import { PutawayWorksheetController } from '../../../../controllers'
import { Worksheet, WorksheetDetail } from '../../../../entities'

export const generatePartialPutawayWorksheetResolver = {
  async generatePartialPutawayWorksheet(_: any, { arrivalNoticeNo, inventories }, context: any): Promise<void> {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      let worksheet: Worksheet = await generatePartialPutawayWorksheet(
        trxMgr,
        domain,
        user,
        arrivalNoticeNo,
        inventories
      )

      if (!worksheet?.arrivalNotice?.id) {
        worksheet = await trxMgr.getRepository(Worksheet).findOne({
          where: { id: worksheet.id },
          relations: ['arrivalNotice']
        })
      }

      const arrivalNotice: ArrivalNotice = worksheet.arrivalNotice
      const unloadingWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
        where: { arrivalNotice, type: WORKSHEET_TYPE.UNLOADING },
        relations: [
          'worksheetDetails',
          'worksheetDetails.targetInventory',
          'worksheetDetails.targetInventory.inventory'
        ]
      })

      const remainPalletCnt: number = await trxMgr.getRepository(Inventory).count({
        where: {
          domain: context.state.domain,
          refOrderId: arrivalNotice.id,
          status: WORKSHEET_STATUS.PARTIALLY_UNLOADED
        }
      })
      const wsdStatus: string = remainPalletCnt >= 0 ? WORKSHEET_STATUS.PARTIALLY_UNLOADED : WORKSHEET_STATUS.EXECUTING

      const worksheetDetails: WorksheetDetail[] = unloadingWorksheet.worksheetDetails
      const nonStartedWorksheetDetails: WorksheetDetail[] = worksheetDetails
        .filter(
          (wsd: WorksheetDetail) => wsd.targetInventory?.inventory?.status !== INVENTORY_STATUS.PARTIALLY_UNLOADED
        )
        .map((wsd: WorksheetDetail) => {
          wsd.status = wsdStatus
          wsd.updater = user
          return wsd
        })

      await trxMgr.getRepository(WorksheetDetail).save(nonStartedWorksheetDetails)
    })
  }
}

export async function generatePartialPutawayWorksheet(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  arrivalNoticeNo: string,
  inventories: Inventory[]
): Promise<Worksheet> {
  const worksheetController: PutawayWorksheetController = new PutawayWorksheetController(trxMgr, domain, user)
  return await worksheetController.generatePutawayWorksheet(arrivalNoticeNo, inventories)
}
