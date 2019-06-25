import { gql } from 'apollo-server-koa'

export const WorksheetList = gql`
  type WorksheetList {
    items: [Worksheet]
    total: Int
  }
`
