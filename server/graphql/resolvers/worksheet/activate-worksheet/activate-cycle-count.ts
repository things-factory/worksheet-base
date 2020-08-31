import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { CycleCountWorksheetController } from 'server/controllers/cycle-count-worksheet-controller'
import { EntityManager, getManager } from 'typeorm'
import { Worksheet } from '../../../../entities'

export const activateCycleCountResolver = {
  async activateCycleCount(_: any, { worksheetNo }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      return await activateCycleCount(trxMgr, domain, user, worksheetNo)
    })
  }
}

export async function activateCycleCount(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  worksheetNo: string
): Promise<Worksheet> {
  const worksheetController: CycleCountWorksheetController = new CycleCountWorksheetController(trxMgr)
  return await worksheetController.activateCycleCount({ domain, user, worksheetNo })
}
