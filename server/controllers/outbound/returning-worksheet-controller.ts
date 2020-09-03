import { OrderInventory, ORDER_INVENTORY_STATUS, ORDER_STATUS, ReleaseGood } from '@things-factory/sales-base'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../constants'
import { Worksheet, WorksheetDetail } from '../../entities'
import { VasWorksheetController } from '../vas/vas-worksheet-controller'

export class ReturningWorksheetController extends VasWorksheetController {
  async generateReturningWorksheet(
    releaseGoodNo: string,
    targetInventories: Partial<OrderInventory>[]
  ): Promise<Worksheet> {
    const releaseGood: ReleaseGood = await this.findRefOrder(
      ReleaseGood,
      { domain: this.domain, name: releaseGoodNo },
      ['bizplace']
    )
    return await this.generateWorksheet(
      WORKSHEET_TYPE.RETURN,
      releaseGood,
      targetInventories,
      ORDER_STATUS.PARTIAL_RETURN,
      ORDER_INVENTORY_STATUS.RETURNING
    )
  }

  async activateReturning(
    worksheetNo: string,
    returningWorksheetDetails: Partial<WorksheetDetail>[]
  ): Promise<Worksheet> {
    const worksheet: Worksheet = await this.findActivatableWorksheet(worksheetNo, WORKSHEET_TYPE.RETURN, [
      'bizplace',
      'releaseGood',
      'worksheetDetails',
      'worksheetDetails.targetInventory'
    ])

    const worksheetDetails: WorksheetDetail[] = worksheet.worksheetDetails
    const targetInventories: OrderInventory[] = worksheetDetails.map((wsd: WorksheetDetail) => {
      let targetInventory: OrderInventory = wsd.targetInventory
      targetInventory.status = ORDER_INVENTORY_STATUS.RETURNING
      targetInventory.updater = this.user
    })
    await this.updateOrderTargets(targetInventories)
    return await this.activateWorksheet(worksheet, worksheetDetails, returningWorksheetDetails)
  }

  async completeReturning(releaseGoodNo: string): Promise<Worksheet> {
    const releaseGood: ReleaseGood = await this.findRefOrder(ReleaseGood, {
      domain: this.domain,
      name: releaseGoodNo,
      status: ORDER_STATUS.PARTIAL_RETURN
    })

    const worksheet: Worksheet = await this.findWorksheetByRefOrder(releaseGood, WORKSHEET_TYPE.RETURN, [
      'worksheetDestails',
      'worksheetDestails.targetInventory'
    ])
    this.checkRecordValidity(worksheet, { status: WORKSHEET_STATUS.EXECUTING })

    return await this.completWorksheet(worksheet, ORDER_STATUS.DONE)
  }
}
