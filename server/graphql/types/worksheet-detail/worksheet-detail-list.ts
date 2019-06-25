import { gql } from 'apollo-server-koa'

export const WorksheetDetailList = gql`
  type WorksheetDetailList {
    items: [WorksheetDetail]
    total: Int
  }
`
