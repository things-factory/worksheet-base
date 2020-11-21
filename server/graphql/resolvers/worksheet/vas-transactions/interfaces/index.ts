import { ArrivalNotice, ReleaseGood, ShippingOrder, VasOrder } from '@things-factory/sales-base'

export * from './repalletizing'
export * from './repackaging'
export * from './relabeling'

export declare type RefOrderType = ArrivalNotice | ReleaseGood | VasOrder | ShippingOrder

export interface OperationGuideInterface<T> {
  data: T
  transactions?: [any]
}

export interface PalletChangesInterface {
  fromPalletId: string
  toPalletId: string
  reducedQty: number
  reducedUomValue: number
  locationName?: string
}
