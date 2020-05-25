import { ArrivalNotice, ReleaseGood, ShippingOrder, VasOrder } from '@things-factory/sales-base'

export declare type RefOrderType = ArrivalNotice | ReleaseGood | VasOrder | ShippingOrder

export interface RepalletizedInvInfo {
  palletId: string
  locationName: string
  addedQty: number
  addedWeight: number
  completed: boolean
}

export interface OperationGuideInterface {
  data: OperationGuideDataInterface
  transactions?: [any]
  completed: boolean
}

export interface OperationGuideDataInterface {
  palletType: string
  stdQty: number
  requiredPalletQty: number
  repalletizedInvs: RepalletizedInvInfo[]
}
