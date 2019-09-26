import { gql } from 'apollo-server-koa'

export const WorksheetDetailPatch = gql`
  input WorksheetDetailPatch {
    name: String
    description: String
    type: String
    worksheet: ObjectRef
    worker: ObjectRef
    targetProduct: OrderProductPatch
    targetVas: OrderVasPatch
    remark: String
    issue: String
    cuFlag: String
  }
`
