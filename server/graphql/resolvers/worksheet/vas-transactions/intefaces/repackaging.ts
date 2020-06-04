export interface RepackedFrom {
  fromPalletId: string
  toPalletId: string
  reducedQty: number
  reducedWeight: number
}

export interface RepackedInvInfo {
  palletId: string
  locationName: string
  repackedPkgQty: number
  repackedFrom: RepackedFrom[]
}

export interface RepackagingGuide {
  packingUnit: string
  toPackingType: string
  stdAmount: number
  requiredPackageQty: number
  repackedInvs: RepackedInvInfo[]
}

export enum PackingUnits {
  WEIGHT = 'WEIGHT',
  QTY = 'QTY'
}
