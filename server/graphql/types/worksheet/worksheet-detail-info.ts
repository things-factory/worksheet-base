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
    adjustedPalletQty: Int
    adjustedBatchId: String
    qty: Int
    weight: Float
    releaseQty: Float
    releaseWeight: Float
    operationGuide: String
    set: Int
    targetType: String
    targetBatchId: String
    targetProduct: Product
    otherTarget: String
    vas: Vas
    targetName: String
    description: String
    seq: Int
    remark: String
    issue: String
    status: String
    location: Location
    locationInv: String
    toLocation: Location
    inventory: Inventory
    relatedOrderInv: OrderInventory
  }
`
