import { OrderInventory, ORDER_INVENTORY_STATUS, ORDER_STATUS, ReleaseGood } from '@things-factory/sales-base'
import { Equal, Not } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../constants'
import { Worksheet, WorksheetDetail } from '../../entities'
import { VasWorksheetController } from '../vas/vas-worksheet-controller'

export class LoadingWorksheetController extends VasWorksheetController {
  async generateLoadingWorksheet(
    releaseGoodNo: string,
    targetInventories: Partial<OrderInventory>[]
  ): Promise<Worksheet> {
    const releaseGood: ReleaseGood = await this.findRefOrder(
      ReleaseGood,
      { domain: this.domain, name: releaseGoodNo },
      ['bizplace']
    )
    return await this.generateWorksheet(
      WORKSHEET_TYPE.LOADING,
      releaseGood,
      targetInventories,
      ORDER_STATUS.LOADING,
      ORDER_INVENTORY_STATUS.LOADING
    )
  }

  async activateLoading(worksheetNo: string, loadingWorksheetDetails: Partial<WorksheetDetail>[]): Promise<Worksheet> {
    const worksheet: Worksheet = await this.findActivatableWorksheet(worksheetNo, WORKSHEET_TYPE.LOADING, [
      'releaseGood',
      'worksheetDetails',
      'worksheetDetails.targetInventory'
    ])

    let releaseGood: ReleaseGood = worksheet.releaseGood
    const nonFinishedVasCnt: number = await this.trxMgr.getRepository(Worksheet).count({
      where: {
        domain: this.domain,
        releaseGood,
        type: WORKSHEET_TYPE.VAS,
        status: Not(Equal(WORKSHEET_STATUS.DONE))
      }
    })
    if (nonFinishedVasCnt) return

    const worksheetDetails: WorksheetDetail[] = worksheet.worksheetDetails
    const targetInventories: OrderInventory[] = worksheetDetails.map((wsd: WorksheetDetail) => {
      let targetInventory: OrderInventory = wsd.targetInventory
      targetInventory.status = ORDER_INVENTORY_STATUS.LOADING
      targetInventory.updater = this.user
      return targetInventory
    })

    releaseGood.status = ORDER_STATUS.LOADING
    releaseGood.updater = this.user
    await this.updateRefOrder(releaseGood)

    await this.updateOrderTargets(targetInventories)
    return await this.activateWorksheet(worksheet, worksheetDetails, loadingWorksheetDetails)
  }

  async completeLoading(releaseGoodNo: string): Promise<Worksheet> {
    const releaseGood: ReleaseGood = await this.findRefOrder(ReleaseGood, {
      domain: this.domain,
      name: releaseGoodNo,
      status: ORDER_STATUS.LOADING
    })

    const worksheet: Worksheet = await this.findWorksheetByRefOrder(releaseGood, WORKSHEET_TYPE.LOADING, [
      'worksheetDestails',
      'worksheetDestails.targetInventory'
    ])
    this.checkRecordValidity(worksheet, { status: WORKSHEET_STATUS.EXECUTING })

    return await this.completWorksheet(worksheet, ORDER_STATUS.DONE)
  }
}
