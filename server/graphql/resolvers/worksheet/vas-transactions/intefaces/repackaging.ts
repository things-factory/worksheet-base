export interface RepackedInvInfo {
  palletId: string
  locationName: string
  repackedPkgQty: number
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
