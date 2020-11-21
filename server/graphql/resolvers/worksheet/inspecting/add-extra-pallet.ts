import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { CycleCountWorksheetController } from '../../../../controllers'

export const addExtraPalletResolver = {
  async addExtraPallet(_: any, { cycleCountNo, palletId, inspectedBatchNo, inspectedQty, inspectedUomValue, locationName }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await addExtraPallet(
        trxMgr,
        domain,
        user,
        cycleCountNo,
        palletId,
        inspectedBatchNo,
        inspectedQty,
        inspectedUomValue,
        locationName
      )
    })
  }
}

export async function addExtraPallet(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  cycleCountNo: string,
  palletId: string,
  inspectedBatchNo: string,
  inspectedQty: number,
  inspectedUomValue: number,
  locationName: string
) {
  const worksheetController: CycleCountWorksheetController = new CycleCountWorksheetController(trxMgr, domain, user)
  await worksheetController.addExtraPallet(cycleCountNo, palletId, inspectedBatchNo, inspectedQty, inspectedUomValue, locationName)
}
