import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager } from 'typeorm'
import { WORKSHEET_TYPE } from '../../../../constants'
import { UnloadingWorksheetController, UnloadingWorksheetDetail } from '../../../../controllers'
import { Worksheet } from '../../../../entities'
import { activatePicking } from '../picking/activate-picking'
import { worksheetByOrderNo } from '../worksheet-by-order-no'

export const activateUnloadingResolver = {
  async activateUnloading(_: any, { worksheetNo, unloadingWorksheetDetails }, context: any) {
    return await getManager().transaction(async trxMgr => {
      const { domain, user }: { domain: Domain; user: User } = context.state
      let unloadingWS: Worksheet = await activateUnloading(trxMgr, domain, user, worksheetNo, unloadingWorksheetDetails)

      if (unloadingWS?.arrivalNotice?.crossDocking === undefined) {
        unloadingWS = await trxMgr.getRepository(Worksheet).findOne(unloadingWS.id, {
          relations: ['arrivalNotice', 'arrivalNotice.releaseGood']
        })
      }

      const crossDocking: boolean = unloadingWS.arrivalNotice.crossDocking
      if (crossDocking) {
        const { name: pickingWorksheetNo } = await worksheetByOrderNo(
          context.state.domain,
          unloadingWS.arrivalNotice.releaseGood.name,
          WORKSHEET_TYPE.PICKING,
          trxMgr
        )
        await activatePicking(trxMgr, pickingWorksheetNo, context.state.domain, context.state.user)
      }

      return unloadingWS
    })
  }
}

export async function activateUnloading(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  worksheetNo: string,
  unloadingWorksheetDetails: UnloadingWorksheetDetail[]
): Promise<Worksheet> {
  const worksheetController: UnloadingWorksheetController = new UnloadingWorksheetController(trxMgr, domain, user)
  return await worksheetController.activateUnloading(worksheetNo, unloadingWorksheetDetails)
}
