import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import { ArrivalNotice, OrderVas, ReleaseGood, ShippingOrder, VasOrder } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager } from 'typeorm'
import { VasTransactionInterface } from './interfaces'

export declare type RefOrderType = ArrivalNotice | ReleaseGood | ShippingOrder | VasOrder

export abstract class AbstractVasTransaction<T1, T2> implements VasTransactionInterface {
  trxMgr: EntityManager
  orderVas: OrderVas
  operationGuideData: T1
  params: T2
  domain: Domain
  bizplace: Bizplace
  user: User

  abstract async exec(): Promise<void>

  constructor(trxMgr: EntityManager, orderVas: any, params: any, context: any) {
    this.trxMgr = trxMgr
    this.orderVas = orderVas
    this.operationGuideData = JSON.parse(orderVas.operationGuide.data)
    this.params = params ? JSON.parse(params) : null
    this.domain = context.state.domain
    this.bizplace = orderVas.bizplace
    this.user = context.state.user
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
}
