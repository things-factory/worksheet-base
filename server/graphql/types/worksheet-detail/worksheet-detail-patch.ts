import { gql } from 'apollo-server-koa'

export const WorksheetDetailPatch = gql`
  input WorksheetDetailPatch {
    name: String
    description: String
    type: String
    worksheet: ObjectRef
    worker: ObjectRef
    fromLocation: ObjectRef
    toLocation: ObjectRef
    targetProduct: ObjectRef
    targetVas: ObjectRef
    remark: String
    cuFlag: String
  }
`
