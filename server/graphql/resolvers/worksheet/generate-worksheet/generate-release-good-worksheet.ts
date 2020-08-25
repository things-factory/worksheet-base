import { EntityManager, getManager } from 'typeorm'
import { GeneratePickingInterface, WorksheetController } from '../../../../controllers/worksheet-controller'
import { Worksheet } from '../../../../entities'

export const generateReleaseGoodWorksheetResolver = {
  async generateReleaseGoodWorksheet(_: any, { releaseGoodNo }, context: any) {
    return await getManager().transaction(async trxMgr => {
      return await generateReleaseGoodWorksheet(trxMgr, releaseGoodNo, context)
    })
  }
}

export async function generateReleaseGoodWorksheet(
  trxMgr: EntityManager,
  releaseGoodNo: string,
  context: any
): Promise<Worksheet> {
  const { domain, user } = context.state

  const worksheetController: WorksheetController = new WorksheetController(trxMgr)

  return await worksheetController.generate({
    domain,
    user,
    releaseGoodNo
  } as GeneratePickingInterface)
}
