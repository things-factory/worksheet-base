import { gql } from 'apollo-server-koa'

export const ReturnOrderWorksheet = gql`
  type ReturnOrderWorksheet {
    returnOrderWorksheet: Worksheet
    vasWorksheet: Worksheet
  }
`
