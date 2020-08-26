import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import { ArrivalNotice, OrderVas, ORDER_VAS_STATUS, ReleaseGood, VasOrder } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../constants'
import { Worksheet, WorksheetDetail } from '../entities'
import { WorksheetNoGenerator } from '../utils'
import { GenerateInterface, ReferenceOrderType, WorksheetController } from './worksheet-controller'

export interface GenerateVasInterface extends GenerateInterface {
  referenceOrder: ReferenceOrderType
}

export class VasWorksheetController extends WorksheetController {
  /**
   * @summary Generate VAS Worksheet
   * @description
   * Create VAS worksheet
   *  - status: DEACTIVATED
   *
   * Create VAS worksheet details
   *  - status: DEACTIVATED
   *
   * Update status of orderVass
   *  - status: ARRIVED => READY_TO_PROCESS
   *
   * @param {GenerateVasInterface} worksheetInterface
   * @returns {Promise<Worksheet>}
   */
  async generateVasWorksheet(worksheetInterface: GenerateVasInterface): Promise<Worksheet> {
    const domain: Domain = worksheetInterface.domain
    const referenceOrder: ReferenceOrderType = worksheetInterface.referenceOrder
    const user: User = worksheetInterface.user

    let bizplace: Bizplace
    let worksheet: Partial<Worksheet> = {
      domain,
      name: WorksheetNoGenerator.vas(),
      type: WORKSHEET_TYPE.VAS,
      status: WORKSHEET_STATUS.DEACTIVATED,
      creator: user,
      updater: user
    }

    let orderVASs: OrderVas[]
    const relations: string[] = ['bizplace', 'orderVass']

    if (referenceOrder instanceof ArrivalNotice) {
      const arrivalNotice: ArrivalNotice = await this.findRefOrder(ArrivalNotice, referenceOrder, relations)
      bizplace = arrivalNotice.bizplace
      orderVASs = arrivalNotice.orderVass
    } else if (referenceOrder instanceof ReleaseGood) {
      const releaseGood: ReleaseGood = await this.findRefOrder(ReleaseGood, referenceOrder, relations)
      bizplace = releaseGood.bizplace
      orderVASs = releaseGood.orderVASs
    } else {
      const vasOrder: VasOrder = await this.findRefOrder(VasOrder, referenceOrder, relations)
      bizplace = vasOrder.bizplace
      orderVASs = vasOrder.orderVass
    }

    worksheet = await this.createWorksheet(domain, bizplace, referenceOrder, WORKSHEET_TYPE.VAS, user)

    const vasWorksheetDetails: Partial<WorksheetDetail>[] = orderVASs.map((targetVas: OrderVas) => {
      return {
        domain,
        bizplace,
        worksheet,
        name: WorksheetNoGenerator.vasDetail(),
        targetVas,
        type: WORKSHEET_TYPE.VAS,
        status: WORKSHEET_STATUS.DEACTIVATED,
        creator: user,
        updater: user
      } as Partial<WorksheetDetail>
    })
    worksheet.worksheetDetails = await this.createWorksheetDetails(vasWorksheetDetails)

    orderVASs.forEach((ordVas: OrderVas) => {
      ordVas.status = ORDER_VAS_STATUS.READY_TO_PROCESS
      ordVas.updater = user
    })
    await this.updateOrderTargets(OrderVas, orderVASs)

    return worksheet as Worksheet
  }
}
