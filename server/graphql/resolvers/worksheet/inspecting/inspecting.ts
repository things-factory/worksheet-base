import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { CycleCountWorksheetController } from '../../../../controllers'

export const inspectingResolver = {
  async inspecting(
    _: any,
    { worksheetDetailName, palletId, locationName, inspectedBatchNo, inspectedQty, inspectedWeight },
    context: any
  ) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await executeInspection(
        trxMgr,
        domain,
        user,
        worksheetDetailName,
        palletId,
        locationName,
        inspectedBatchNo,
        inspectedQty,
        inspectedWeight
      )
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
  inspectedBatchNo: string,
  inspectedQty: number,
  inspectedWeight: number
) {
  const worksheetController: CycleCountWorksheetController = new CycleCountWorksheetController(trxMgr, domain, user)
  await worksheetController.inspecting(
    worksheetDetailName,
    palletId,
    locationName,
    inspectedBatchNo,
    inspectedQty,
    inspectedWeight
  )
}
