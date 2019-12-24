import { gql } from 'apollo-server-koa'

export const InventoryInfo = gql`
  type InventoryInfo {
    palletId: String
  }
`
