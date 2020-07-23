import { PalletChangesInterface } from './index'

export interface RepalletizedInvInfo {
  palletId: string
  locationName: string
  repalletizedFrom: PalletChangesInterface[]
}

export interface RepalletizingGuide {
  palletType: string
  stdQty: number
  requiredPalletQty: number
  repalletizedInvs: RepalletizedInvInfo[]
}
