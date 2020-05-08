import { gql } from 'apollo-server-koa'

export const InventoryCheckWorksheet = gql`
  type InventoryCheckWorksheet {
    cycleCountWorksheet: Worksheet
  }
`
