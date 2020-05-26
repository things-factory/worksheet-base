export interface RepalletizedInvInfo {
  palletId: string
  locationName: string
  addedQty: number
  addedWeight: number
  completed: boolean
}

export interface RepalletizingGuide {
  palletType: string
  stdQty: number
  requiredPalletQty: number
  repalletizedInvs: RepalletizedInvInfo[]
}
