export interface RelabelingToProduct {
  id: string
  name: string
  description: string
}

export interface RelabelingLabel {
  id: string
  namd: string
  path: string
}

export interface RelabelingGuide {
  toProduct?: RelabelingToProduct
  toBatchId?: string
  newLabel: RelabelingLabel
}
