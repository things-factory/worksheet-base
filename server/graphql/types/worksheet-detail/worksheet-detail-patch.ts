import { gql } from 'apollo-server-koa'

export const WorksheetDetailPatch = gql`
  input WorksheetDetailPatch {
    name: String
    description: String
    seq: Int
    type: String
    worksheet: ObjectRef
    worker: ObjectRef
    initialBatchId: String
    hasBatchChanges: Boolean
    targetProduct: OrderProductPatch
    targetVas: OrderVasPatch
    targetInventory: OrderInventoryPatch
    fromLocation: ObjectRef
    toLocation: ObjectRef
    batchId: String
    palletQty: Int
    palletizingDescription: String
    status: String
    remark: String
    issue: String
    cuFlag: String
  }
`
