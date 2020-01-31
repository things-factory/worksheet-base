import { gql } from 'apollo-server-koa'

export const LoadedInventoryInfo = gql`
  type LoadedInventoryInfo {
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
    releaseWeight: Float
    targetName: String
    productDescription: String
    description: String
    remark: String
    issue: String
    status: String
    location: Location
    inventory: Inventory
  }
`
