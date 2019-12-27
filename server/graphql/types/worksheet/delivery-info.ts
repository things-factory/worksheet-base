import { gql } from 'apollo-server-koa'

export const DeliveryInfo = gql`
  type DeliveryInfo {
    palletId: String
    batchId: String
    product: Product
    truckNo: String
    driver: String
  }
`
