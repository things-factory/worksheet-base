import { ArrivalNotice, ReleaseGood, ShippingOrder, VasOrder } from '@things-factory/sales-base'

export * from './repalletizing'
export * from './repackaging'

export declare type RefOrderType = ArrivalNotice | ReleaseGood | VasOrder | ShippingOrder

export interface OperationGuideInterface<T> {
  data: T
  transactions?: [any]
  completed: boolean
}

export interface PalletChangesInterface {
  fromPalletId: string
  toPalletId: string
  reducedQty: number
  reducedWeight: number
}
