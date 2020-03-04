import { gql } from 'apollo-server-koa'

export const DeliveryOrderInfo = gql`
  type DeliveryOrderInfo {
    ownCollection: Boolean
    doStatus: String
    truckNo: String
  }
`
