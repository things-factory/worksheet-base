import gql from 'graphql-tag'

export const InventoryDetail = gql`
  type InventoryDetail {
    id: String
    domain: Domain
    bizplace: Bizplace
    refInventory: Inventory
    name: String
    palletId: String
    batchId: String
    product: Product
    location: Location
    warehouse: Warehouse
    zone: String
    packingType: String
    qty: Int
    remainQty: Int
    otherRef: String
    lastSeq: Int
    weight: Float
    remainWeight: Float
    unit: String
    status: String
    description: String
    creator: User
    updater: User
    createdAt: String
    updatedAt: String
  }
`
