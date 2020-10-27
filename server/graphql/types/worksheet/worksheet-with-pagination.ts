import { gql } from 'apollo-server-koa'

export const WorksheetWithPagination = gql`
  type WorksheetWithPagination {
    worksheet: Worksheet
    worksheetDetails: [WorksheetDetail]
    total: Int
  }
`
