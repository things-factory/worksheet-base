import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { CycleCountWorksheetController } from '../../../../controllers'

export const inspectingResolver = {
  async inspecting(_: any, { worksheetDetailName, inspectedBatchNo, inspectedQty, inspectedUomValue }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await executeInspection(
        trxMgr,
        domain,
        user,
        worksheetDetailName,
        inspectedBatchNo,
        inspectedQty,
        inspectedUomValue
      )
    })
  }
}

export async function executeInspection(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  worksheetDetailName: string,
  inspectedBatchNo: string,
  inspectedQty: number,
  inspectedUomValue: number
) {
  const worksheetController: CycleCountWorksheetController = new CycleCountWorksheetController(trxMgr, domain, user)
  await worksheetController.inspecting(worksheetDetailName, inspectedBatchNo, inspectedQty, inspectedUomValue)
}
