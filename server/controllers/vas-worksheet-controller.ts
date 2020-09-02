import { User } from '@things-factory/auth-base'
import {
  ArrivalNotice,
  OrderVas,
  ORDER_STATUS,
  ORDER_TYPES,
  ORDER_VAS_STATUS,
  ReleaseGood,
  VasOrder
} from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager } from 'typeorm'
import { WORKSHEET_TYPE } from '../constants'
import { Worksheet, WorksheetDetail } from '../entities'
import {
  completeRelabeling,
  completeRepackaging,
  completeRepalletizing
} from '../graphql/resolvers/worksheet/vas-transactions'
import { BasicInterface, ReferenceOrderType, WorksheetController } from './worksheet-controller'

export interface GenerateVasInterface extends BasicInterface {
  referenceOrder: ReferenceOrderType
}

export interface ActivateVASInterface extends BasicInterface {
  worksheetNo: string
  vasWorksheetDetails: Partial<WorksheetDetail>[]
}

export interface CompleteVASInterface extends BasicInterface {
  orderNo: string
  orderType: string
}

type CompleteTransactionType = (trxMgr: EntityManager, orderVas: OrderVas, user: User) => Promise<void>

export class VasWorksheetController extends WorksheetController {
  private readonly COMPLETE_TRX_MAP: Record<string, CompleteTransactionType> = {
    'vas-repalletizing': completeRepalletizing,
    'vas-repack': completeRepackaging,
    'vas-relabel': completeRelabeling
  }

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
    const refOrder: ReferenceOrderType = worksheetInterface.referenceOrder
    const user: User = worksheetInterface.user

    let orderVASs: OrderVas[]

    if (refOrder instanceof ArrivalNotice) {
      const arrivalNotice: ArrivalNotice = await this.findRefOrder(ArrivalNotice, refOrder, ['orderVass'])
      orderVASs = arrivalNotice.orderVass
    } else if (refOrder instanceof ReleaseGood) {
      const releaseGood: ReleaseGood = await this.findRefOrder(ReleaseGood, refOrder, ['orderVass'])
      orderVASs = releaseGood.orderVASs
    } else {
      const vasOrder: VasOrder = await this.findRefOrder(VasOrder, refOrder, ['orderVass'])
      orderVASs = vasOrder.orderVass
    }

    return await this.generateWorksheet(
      domain,
      user,
      WORKSHEET_TYPE.VAS,
      refOrder,
      orderVASs,
      refOrder.status,
      ORDER_VAS_STATUS.READY_TO_PROCESS
    )
  }

  async activateVAS(worksheetInterface: ActivateVASInterface): Promise<Worksheet> {
    const domain: Domain = worksheetInterface.domain
    const user: User = worksheetInterface.user
    const worksheetNo: string = worksheetInterface.worksheetNo

    const worksheet: Worksheet = await this.findActivatableWorksheet(domain, worksheetNo, WORKSHEET_TYPE.VAS, [
      'vasOrder',
      'worksheetDetails',
      'worksheetDetails.targetVas'
    ])

    const worksheetDetails: WorksheetDetail[] = worksheet.worksheetDetails
    const targetVASs: OrderVas[] = worksheetDetails.map((wsd: WorksheetDetail) => {
      let targetVAS: OrderVas = wsd.targetVas
      targetVAS.status = ORDER_VAS_STATUS.PROCESSING
      targetVAS.updater = user
      return targetVAS
    })

    // Update VAS Order if it's pure VAS Order (status: READY_TO_PROCESS => PROCESSING)
    let vasOrder: VasOrder = worksheet.vasOrder
    if (vasOrder?.id) {
      vasOrder.status = ORDER_STATUS.PROCESSING
      vasOrder.updater = user

      await this.updateRefOrder(vasOrder)
    }

    await this.updateOrderTargets(targetVASs)
    return await this.activateWorksheet(worksheet, worksheetDetails, worksheetInterface.vasWorksheetDetails, user)
  }

  async completeVAS(worksheetInterface: CompleteVASInterface): Promise<Worksheet> {
    const domain: Domain = worksheetInterface.domain
    const user: User = worksheetInterface.user
    const orderNo: string = worksheetInterface.orderNo
    const orderType: string = worksheetInterface.orderType

    const ENTITY_MAP: { [key: string]: ArrivalNotice | ReleaseGood | VasOrder } = {
      [ORDER_TYPES.ARRIVAL_NOTICE]: ArrivalNotice,
      [ORDER_TYPES.RELEASE_OF_GOODS]: ReleaseGood,
      [ORDER_TYPES.VAS_ORDER]: VasOrder
    }
    const refOrder: ReferenceOrderType = await this.findRefOrder(ENTITY_MAP[orderType], { domain, name: orderNo })
    let worksheet: Worksheet = await this.findWorksheetByRefOrder(domain, refOrder, WORKSHEET_TYPE.VAS, [
      'worksheetDetails',
      'worksheetDetails.targetVas',
      'worksheetDetails.targetVas.vas'
    ])

    const isPureVAS: boolean = refOrder instanceof VasOrder
    if (isPureVAS) {
      worksheet = await this.completWorksheet(worksheet, user, ORDER_STATUS.DONE)
    }

    // Do complete operation transactions if there it is
    const worksheetDetails: WorksheetDetail[] = worksheet.worksheetDetails
    const targetVASs: OrderVas[] = worksheetDetails.map((wsd: WorksheetDetail) => wsd.targetVas)

    for (const targetVAS of targetVASs) {
      const { issue }: { issue: string } = worksheetDetails.find(
        (wsd: WorksheetDetail) => wsd.targetVas.id === targetVAS.id
      )

      if (targetVAS.operationGuide && !issue) {
        await this.doOperationTransaction(targetVAS, user)
      }
    }

    return worksheet
  }

  async doOperationTransaction(targetVAS: OrderVas, user: User): Promise<void> {
    const operationGuide: string = targetVAS.vas?.operationGuide
    if (operationGuide) {
      await this.COMPLETE_TRX_MAP[operationGuide](this.trxMgr, targetVAS, user)
    }
  }
}
