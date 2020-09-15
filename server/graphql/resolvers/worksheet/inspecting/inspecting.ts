import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { CycleCountWorksheetController } from '../../../../controllers'

export const inspectingResolver = {
  async inspecting(_: any, { worksheetDetailName, palletId, locationName, inspectedQty }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await executeInspection(trxMgr, domain, user, worksheetDetailName, palletId, locationName, inspectedQty)
    })
  }
}

export async function executeInspection(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  worksheetDetailName: string,
  palletId: string,
  locationName: string,
  inspectedQty: number
) {
  const worksheetController: CycleCountWorksheetController = new CycleCountWorksheetController(trxMgr, domain, user)
  await worksheetController.inspecting(worksheetDetailName, palletId, locationName, inspectedQty)
}
