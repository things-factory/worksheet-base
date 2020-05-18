import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import {
  ArrivalNotice,
  OrderVas,
  ORDER_VAS_STATUS,
  ReleaseGood,
  ShippingOrder,
  VasOrder
} from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory } from '@things-factory/warehouse-base'
import { EntityManager, Repository } from 'typeorm'
import { WORKSHEET_STATUS } from '../../constants'
import { Worksheet, WorksheetDetail } from '../../entities'
import { VasTransactionInterface } from './interfaces'

export declare type RefOrderType = ArrivalNotice | ReleaseGood | ShippingOrder | VasOrder

export abstract class AbstractVasTransaction<OperationGuideType, CompletedParamType>
  implements VasTransactionInterface<OperationGuideType> {
  trxMgr: EntityManager
  orderVas: OrderVas
  inventory: Inventory
  operationGuideData: OperationGuideType
  params: CompletedParamType
  domain: Domain
  bizplace: Bizplace
  user: User
  // Flag to figure out whether the vas task affects to other vas task
  isConnectedVas: boolean

  /**
   * @description: Transaction executer any changes are required by VAS
   * Adjustment logic should be implemented at exec function
   */
  abstract async exec(): Promise<void>
  /**
   * @description If one transaction affects other VAS tasks
   * updateOperationGuide function will call this function to get updated opreation guide data to update other VAS tasks
   */
  abstract getUpdatedOperationGuideData(): { data: OperationGuideType; completed: boolean }

  constructor(trxMgr: EntityManager, orderVas: any, params: string, context: any, isConnectedVas: boolean) {
    this.trxMgr = trxMgr
    this.orderVas = orderVas
    this.operationGuideData = JSON.parse(orderVas.operationGuide.data)
    this.params = params ? JSON.parse(params) : null
    this.domain = context.state.domain
    this.bizplace = orderVas.bizplace
    this.user = context.state.user
    this.isConnectedVas = isConnectedVas
  }

  async getRefOrder(): Promise<ArrivalNotice | ReleaseGood | ShippingOrder | VasOrder> {
    if (
      !this.orderVas.arrivalNotice &&
      !this.orderVas.releaseGood &&
      !this.orderVas.shippingOrder &&
      !this.orderVas.vasOrder
    ) {
      this.orderVas = await this.trxMgr.getRepository(OrderVas).findOne(this.orderVas.id, {
        relations: ['arrivalNotice', 'releaseGood', 'shippingOrder', 'vasOrder']
      })
    }

    let refOrder: ArrivalNotice | ReleaseGood | ShippingOrder | VasOrder
    if (this.orderVas.arrivalNotice.id) {
      refOrder = this.orderVas.arrivalNotice
    } else if (this.orderVas.releaseGood.id) {
      refOrder = this.orderVas.releaseGood
    } else if (this.orderVas.shippingOrder.id) {
      refOrder = this.orderVas.shippingOrder
    } else if (this.orderVas.vasOrder.id) {
      refOrder = this.orderVas.vasOrder
    }

    return refOrder
  }

  /**
   * @description Primary function to execute VAS
   * This function will execute
   * exec
   * updateOperationGuide
   * functions but updateOperationGuide will only be called when isConnectedVas is equal to true
   * isConnectedVas means one VAS tasks affects to other VAS tasks.
   */
  async executeVas() {
    await this.exec()

    const refOrder: RefOrderType = await this.getRefOrder()
    if (this.isConnectedVas) {
      await this.updateOperationGuide(refOrder)
    }
  }

  /**
   * @description If the VAS tasks affects other VAS tasks (isConnectedVas == true)
   * This function will update every related OrderVas which is related with current VAS
   * @param refOrder
   */
  async updateOperationGuide(refOrder: RefOrderType) {
    const ovRepo: Repository<OrderVas> = this.trxMgr.getRepository(OrderVas)
    const wsRepo: Repository<Worksheet> = this.trxMgr.getRepository(Worksheet)
    const wsdRepo: Repository<WorksheetDetail> = this.trxMgr.getRepository(WorksheetDetail)

    let where: {
      arrivalNotice?: ArrivalNotice
      releaseGood?: ReleaseGood
      vasOrder?: VasOrder
      shippingOrder?: ShippingOrder
    }
    if (refOrder instanceof ArrivalNotice) {
      where.arrivalNotice = refOrder
    } else if (refOrder instanceof ReleaseGood) {
      where.releaseGood = refOrder
    } else if (refOrder instanceof VasOrder) {
      where.vasOrder = refOrder
    } else if (refOrder instanceof ShippingOrder) {
      where.shippingOrder = refOrder
    }

    const worksheet: Worksheet = await wsRepo.findOne({
      where,
      relations: ['worksheetDetails', 'worksheetDetails.targetVas', 'worksheetDetails.targetVas.vas']
    })

    let worksheetDetails: WorksheetDetail[] = worksheet.worksheetDetails
    let relatedOrderVas: OrderVas[] = worksheetDetails
      .map((wsd: WorksheetDetail) => wsd.targetVas)
      .filter((targetVas: OrderVas) => targetVas.set === this.orderVas.set && targetVas.vas.id === this.orderVas.vas.id)

    const { data, completed } = this.getUpdatedOperationGuideData()
    const updatedOperationGuideData: OperationGuideType = data
    relatedOrderVas = relatedOrderVas.map((orderVas: OrderVas) => {
      return {
        ...orderVas,
        operationGuide: JSON.stringify({
          ...JSON.parse(orderVas.operationGuide),
          data: updatedOperationGuideData
        })
      }
    })
    await ovRepo.save(relatedOrderVas)

    // Complete related order vas if there's no more packageQty
    if (completed) {
      // Update worksheet details
      worksheetDetails = worksheetDetails.map((wsd: WorksheetDetail) => {
        return { ...wsd, status: WORKSHEET_STATUS.DONE, updater: this.user }
      })

      await wsdRepo.save(worksheetDetails)

      // Update vas
      relatedOrderVas = relatedOrderVas.map((ov: OrderVas) => {
        return {
          ...ov,
          status: ORDER_VAS_STATUS.COMPLETED,
          updater: this.user
        }
      })
      await ovRepo.save(relatedOrderVas)
    }
  }
}
