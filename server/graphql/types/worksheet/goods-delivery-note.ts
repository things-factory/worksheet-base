import { gql } from 'apollo-server-koa'

export const GoodsDeliveryNote = gql`
  type GoodsDeliveryNote {
    deliveryOrderInfo: DeliveryOrderInfo
    loadedInventoryInfo: [LoadedInventoryInfo]
    contactPointInfo: [ContactPointInfo]
  }
`
