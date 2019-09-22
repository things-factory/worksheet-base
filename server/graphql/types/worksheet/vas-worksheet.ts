import { gql } from 'apollo-server-koa'

export const VasWorksheet = gql`
  type VasWorksheet {
    worksheet: worksheetInfo
    worksheetDetails: [WorksheetDetail]
  }
`
