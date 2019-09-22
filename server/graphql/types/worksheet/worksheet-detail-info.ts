import { gql } from 'apollo-server-koa'

export const WorksheetDetailInfo = gql`
  type WorksheetDetailInfo {
    batchId: String
    product: Product
    packingType: String
    palletQty: Int
    packQty: Int
    actualQty: Int
    vas: Vas
    description: String
    remark: String
  }
`
