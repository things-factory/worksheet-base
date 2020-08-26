import { User } from '@things-factory/auth-base'
import { ArrivalNotice } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory, INVENTORY_STATUS } from '@things-factory/warehouse-base'
import { EntityManager, getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../../constants'
import { InboundWorksheetController } from '../../../../controllers/inbound-worksheet-controller'
import { Worksheet, WorksheetDetail } from '../../../../entities'

export const generatePutawayWorksheetResolver = {
  async generatePutawayWorksheet(_: any, { arrivalNoticeNo, inventories }, context: any): Promise<void> {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      let worksheet: Worksheet = await generatePutawayWorksheet(trxMgr, domain, user, arrivalNoticeNo, inventories)

      if (!worksheet.arrivalNotice?.id) {
        worksheet = await trxMgr.getRepository(Worksheet).findOne({
          where: { id: worksheet.id },
          relations: ['arrivalNotice']
        })
      }

      // Find whether there's partially unloaded and not started inventories
      // to execute it automatically.
      const arrivalNotice: ArrivalNotice = worksheet.arrivalNotice
      const unloadingWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
        where: { arrivalNotice, type: WORKSHEET_TYPE.UNLOADING },
        relations: [
          'worksheetDetails',
          'worksheetDetails.targetInventory',
          'worksheetDetails.targetInventory.inventory'
        ]
      })
      const worksheetDetails: WorksheetDetail[] = unloadingWorksheet.worksheetDetails
      const nonStartedWorksheetDetails: WorksheetDetail[] = worksheetDetails
        .filter(
          (wsd: WorksheetDetail) => wsd.targetInventory?.inventory?.status !== INVENTORY_STATUS.PARTIALLY_UNLOADED
        )
        .map((wsd: WorksheetDetail) => {
          wsd.status = WORKSHEET_STATUS.EXECUTING
          wsd.updater = user

          return wsd
        })

      await trxMgr.getRepository(WorksheetDetail).save(nonStartedWorksheetDetails)
    })
  }
}

export async function generatePutawayWorksheet(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  arrivalNoticeNo: string,
  inventories: Inventory[]
): Promise<Worksheet> {
  const worksheetController: InboundWorksheetController = new InboundWorksheetController(trxMgr)
  return await worksheetController.generatePutawayWorksheet({ domain, user, arrivalNoticeNo, inventories })
}
