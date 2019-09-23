import { gql } from 'apollo-server-koa'

export const WorksheetDetailInfo = gql`
  type WorksheetDetailInfo {
    name: String
    batchId: String
    product: Product
    packingType: String
    palletQty: Int
    packQty: Int
    actualQty: Int
    toLocation: Location
    vas: Vas
    targetName: String
    description: String
    remark: String
  }
`
