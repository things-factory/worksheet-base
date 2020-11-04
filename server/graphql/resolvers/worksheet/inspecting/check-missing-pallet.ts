import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { CycleCountWorksheetController } from '../../../../controllers'

export const checkMissingPalletResolver = {
  async checkMissingPallet(_: any, { worksheetDetailName }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      await checkMissingPallet(
        trxMgr,
        domain,
        user,
        worksheetDetailName
      )
    })
  }
}

export async function checkMissingPallet(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  worksheetDetailName: string,
) {
  const worksheetController: CycleCountWorksheetController = new CycleCountWorksheetController(trxMgr, domain, user)
  await worksheetController.checkMissingPallet(worksheetDetailName)
}
