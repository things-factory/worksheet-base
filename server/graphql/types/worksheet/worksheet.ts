import { gql } from 'apollo-server-koa'

export const Worksheet = gql`
  type Worksheet {
    id: String
    domain: Domain
    bizplace: Bizplace
    bufferLocation: Location
    arrivalNotice: ArrivalNotice
    releaseGood: ReleaseGood
    shippingOrder: ShippingOrder
    vasOrder: VasOrder
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
