import { gql } from 'apollo-server-koa'

export const VasOrderWorksheet = gql`
  type VasOrderWorksheet {
    vasOrderWorksheet: Worksheet
  }
`
