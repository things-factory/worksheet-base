import { gql } from 'apollo-server-koa'

export const NewWorksheetDetail = gql`
  input NewWorksheetDetail {
    name: String
    description: String
    seq: Int
    type: String
    worksheet: ObjectRef
    worker: ObjectRef
    targetProduct: ObjectRef
    targetVas: ObjectRef
    targetInventory: OrderInventoryPatch
    fromLocation: ObjectRef
    toLocation: ObjectRef
    status: String
    remark: String
    issue: String
  }
`
