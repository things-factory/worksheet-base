import { gql } from 'apollo-server-koa'

export const WorksheetDetailInfo = gql`
  type WorksheetDetailInfo {
    name: String
    palletId: String
    batchId: String
    product: Product
    packingType: String
    palletQty: Int
    actualPalletQty: Int
    packQty: Int
    actualPackQty: Int
    qty: Int
    releaseQty: Int
    operationGuide: String
    vas: Vas
    targetName: String
    description: String
    remark: String
    issue: String
    status: String
    location: Location
    toLocation: Location
  }
`
