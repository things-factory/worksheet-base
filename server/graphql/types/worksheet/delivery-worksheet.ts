import { gql } from 'apollo-server-koa'

export const DeliveryWorksheet = gql`
  type DeliveryWorksheet {
    deliveryInfo: DeliveryInfo
  }
`
