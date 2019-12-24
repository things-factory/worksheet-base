import { gql } from 'apollo-server-koa'

export const DeliveryWorksheet = gql`
  type DeliveryWorksheet {
    inventoryInfo: InventoryInfo
    deliveryInfo: DeliveryInfo
  }
`
