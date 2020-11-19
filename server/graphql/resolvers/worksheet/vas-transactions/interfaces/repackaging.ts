import { PalletChangesInterface } from './index'

export interface RepackedInvInfo {
  palletId: string
  locationName: string
  repackedPkgQty: number
  repackedFrom: PalletChangesInterface[]
}

export interface RepackagingGuide {
  packingUnit: string
  toPackingType: string
  stdAmount: number
  requiredPackageQty: number
  repackedInvs: RepackedInvInfo[]
}

export enum PackingUnits {
  UOM = 'UOM',
  QTY = 'QTY'
}
