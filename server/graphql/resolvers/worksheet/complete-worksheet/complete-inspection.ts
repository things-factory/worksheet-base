import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { WORKSHEET_STATUS } from '../../../../constants'
import { CycleCountWorksheetController } from '../../../../controllers/cycle-count-worksheet-controller'
import { WorksheetController } from '../../../../controllers/worksheet-controller'
import { Worksheet } from '../../../../entities'

export const completeInspectionResolver = {
  async completeInspection(_: any, { inventoryCheckNo }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      const worksheet: Worksheet = await completeCycleCount(trxMgr, domain, user, inventoryCheckNo)

      const message: string =
        worksheet.status === WORKSHEET_STATUS.DONE
          ? `Inventories are checked successfully.`
          : `There are inventories needed to be reviewed. `
      const worksheetController: WorksheetController = new WorksheetController(trxMgr)

      await worksheetController.notifiyToOfficeAdmin(domain, {
        title: `Inventory check has been completed`,
        message,
        url: context.header.referer
      })
    })
  }
}

export async function completeCycleCount(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  inventoryCheckNo: string
): Promise<Worksheet> {
  const worksheetController: CycleCountWorksheetController = new CycleCountWorksheetController(trxMgr)
  return await worksheetController.completeCycleCount({ domain, user, inventoryCheckNo })
}
