import { User } from '@things-factory/auth-base'
import { ReturnOrder } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory, INVENTORY_STATUS } from '@things-factory/warehouse-base'
import { EntityManager, getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../../constants'
import { PutawayReturningWorksheetController } from '../../../../controllers'
import { Worksheet, WorksheetDetail } from '../../../../entities'

export const generatePartialPutawayReturnWorksheetResolver = {
  async generatePartialPutawayReturnWorksheet(_: any, { returnOrderNo, inventories }, context: any): Promise<void> {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      let worksheet: Worksheet = await generatePartialPutawayReturnWorksheet(
        trxMgr,
        domain,
        user,
        returnOrderNo,
        inventories
      )

      if (!worksheet?.returnOrder?.id) {
        worksheet = await trxMgr.getRepository(Worksheet).findOne({
          where: { id: worksheet.id },
          relations: ['returnOrder']
        })
      }

      const returnOrder: ReturnOrder = worksheet.returnOrder
      const unloadingWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
        where: { returnOrder, type: WORKSHEET_TYPE.UNLOADING_RETURN },
        relations: [
          'worksheetDetails',
          'worksheetDetails.targetInventory',
          'worksheetDetails.targetInventory.inventory'
        ]
      })

      const remainPalletCnt: number = await trxMgr.getRepository(Inventory).count({
        where: {
          domain: context.state.domain,
          refOrderId: returnOrder.id,
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

export async function generatePartialPutawayReturnWorksheet(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  returnOrderNo: string,
  inventories: Inventory[]
): Promise<Worksheet> {
  const worksheetController: PutawayReturningWorksheetController = new PutawayReturningWorksheetController(trxMgr, domain, user)
  return await worksheetController.generatePutawayReturnWorksheet(returnOrderNo, inventories)
}
