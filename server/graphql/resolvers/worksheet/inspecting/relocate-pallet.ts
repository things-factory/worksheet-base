import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { CycleCountWorksheetController } from '../../../../controllers'

export const relocatePalletResolver = {
  async relocatePallet(_: any, { worksheetDetailName, inspectedBatchNo, inspectedQty, inspectedStdUnitValue, inspectedLocationName }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await relocatePallet(
        trxMgr,
        domain,
        user,
        worksheetDetailName,
        inspectedBatchNo,
        inspectedQty,
        inspectedStdUnitValue,
        inspectedLocationName
      )
    })
  }
}

export async function relocatePallet(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  worksheetDetailName: string,
  inspectedBatchNo: string,
  inspectedQty: number,
  inspectedStdUnitValue: number,
  inspectedLocationName: string
) {
  const worksheetController: CycleCountWorksheetController = new CycleCountWorksheetController(trxMgr, domain, user)
  await worksheetController.relocatePallet(worksheetDetailName, inspectedBatchNo, inspectedQty, inspectedStdUnitValue, inspectedLocationName)
}
