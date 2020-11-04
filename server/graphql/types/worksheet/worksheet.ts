import { gql } from 'apollo-server-koa'

export const Worksheet = gql`
  type Worksheet {
    id: String
    domain: Domain
    bizplace: Bizplace
    bufferLocation: Location
    arrivalNotice: ArrivalNotice
    orderProducts: [OrderProduct]
    releaseGood: ReleaseGood
    returnOrder: ReturnOrder
    inventoryCheck: InventoryCheck
    orderInventories: [OrderInventory]
    shippingOrder: ShippingOrder
    vasOrder: VasOrder
    orderVass: [OrderVas]
    name: String
    description: String
    type: String
    worksheetDetails: [WorksheetDetail]
    status: String
    startedAt: String
    endedAt: String
    creator: User
    updater: User
    createdAt: String
    updatedAt: String
  }
`
