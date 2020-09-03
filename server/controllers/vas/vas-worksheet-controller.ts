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
import { EntityManager } from 'typeorm'
import { WORKSHEET_TYPE } from '../../constants'
import { Worksheet, WorksheetDetail } from '../../entities'
import {
  completeRelabeling,
  completeRepackaging,
  completeRepalletizing
} from '../../graphql/resolvers/worksheet/vas-transactions'
import { ReferenceOrderType, WorksheetController } from '.././worksheet-controller'

type CompleteTransactionType = (trxMgr: EntityManager, orderVas: OrderVas, user: User) => Promise<void>

export class VasWorksheetController extends WorksheetController {
  private readonly COMPLETE_TRX_MAP: Record<string, CompleteTransactionType> = {
    'vas-repalletizing': completeRepalletizing,
    'vas-repack': completeRepackaging,
    'vas-relabel': completeRelabeling
  }

  async generateVasWorksheet(referenceOrder: ReferenceOrderType): Promise<Worksheet> {
    let orderVASs: OrderVas[]

    if (referenceOrder instanceof ArrivalNotice) {
      const arrivalNotice: ArrivalNotice = await this.findRefOrder(ArrivalNotice, referenceOrder, ['orderVass'])
      orderVASs = arrivalNotice.orderVass
    } else if (referenceOrder instanceof ReleaseGood) {
      const releaseGood: ReleaseGood = await this.findRefOrder(ReleaseGood, referenceOrder, ['orderVass'])
      orderVASs = releaseGood.orderVASs
    } else {
      const vasOrder: VasOrder = await this.findRefOrder(VasOrder, referenceOrder, ['orderVass'])
      orderVASs = vasOrder.orderVass
    }

    return await this.generateWorksheet(
      WORKSHEET_TYPE.VAS,
      referenceOrder,
      orderVASs,
      referenceOrder.status,
      ORDER_VAS_STATUS.READY_TO_PROCESS
    )
  }

  async activateVAS(worksheetNo: string, vasWorksheetDetails: Partial<WorksheetDetail>[]): Promise<Worksheet> {
    const worksheet: Worksheet = await this.findActivatableWorksheet(worksheetNo, WORKSHEET_TYPE.VAS, [
      'vasOrder',
      'worksheetDetails',
      'worksheetDetails.targetVas'
    ])

    const worksheetDetails: WorksheetDetail[] = worksheet.worksheetDetails
    const targetVASs: OrderVas[] = worksheetDetails.map((wsd: WorksheetDetail) => {
      let targetVAS: OrderVas = wsd.targetVas
      targetVAS.status = ORDER_VAS_STATUS.PROCESSING
      targetVAS.updater = this.user
      return targetVAS
    })

    // Update VAS Order if it's pure VAS Order (status: READY_TO_PROCESS => PROCESSING)
    let vasOrder: VasOrder = worksheet.vasOrder
    if (vasOrder?.id) {
      vasOrder.status = ORDER_STATUS.PROCESSING
      vasOrder.updater = this.user

      await this.updateRefOrder(vasOrder)
    }

    await this.updateOrderTargets(targetVASs)
    return await this.activateWorksheet(worksheet, worksheetDetails, vasWorksheetDetails)
  }

  async completeVAS(orderNo: string, orderType: string): Promise<Worksheet> {
    const ENTITY_MAP: { [key: string]: ArrivalNotice | ReleaseGood | VasOrder } = {
      [ORDER_TYPES.ARRIVAL_NOTICE]: ArrivalNotice,
      [ORDER_TYPES.RELEASE_OF_GOODS]: ReleaseGood,
      [ORDER_TYPES.VAS_ORDER]: VasOrder
    }
    const refOrder: ReferenceOrderType = await this.findRefOrder(ENTITY_MAP[orderType], {
      domain: this.domain,
      name: orderNo
    })
    let worksheet: Worksheet = await this.findWorksheetByRefOrder(refOrder, WORKSHEET_TYPE.VAS, [
      'worksheetDetails',
      'worksheetDetails.targetVas',
      'worksheetDetails.targetVas.vas'
    ])

    const isPureVAS: boolean = refOrder instanceof VasOrder
    if (isPureVAS) {
      worksheet = await this.completWorksheet(worksheet, ORDER_STATUS.DONE)
    }

    // Do complete operation transactions if there it is
    const worksheetDetails: WorksheetDetail[] = worksheet.worksheetDetails
    const targetVASs: OrderVas[] = worksheetDetails.map((wsd: WorksheetDetail) => wsd.targetVas)

    for (const targetVAS of targetVASs) {
      const { issue }: { issue: string } = worksheetDetails.find(
        (wsd: WorksheetDetail) => wsd.targetVas.id === targetVAS.id
      )

      if (targetVAS.operationGuide && !issue) {
        await this.doOperationTransaction(targetVAS)
      }
    }

    return worksheet
  }

  async doOperationTransaction(targetVAS: OrderVas): Promise<void> {
    const operationGuide: string = targetVAS.vas?.operationGuide
    if (operationGuide) {
      await this.COMPLETE_TRX_MAP[operationGuide](this.trxMgr, targetVAS, this.user)
    }
  }
}
