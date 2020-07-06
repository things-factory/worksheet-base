import { gql } from 'apollo-server-koa'

export const ProductApproval = gql`
  input ProductApproval {
    id: String!
    adjustedBatchId: String!
    batchId: String!
    product: ObjectRef
  }
`
