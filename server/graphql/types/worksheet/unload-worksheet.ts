import { gql } from 'apollo-server-koa'

export const UnloadWorksheet = gql`
  type UnloadWorksheet {
    worksheetInfo: WorksheetInfo
    worksheetDetails: [WorksheetDetail]
  }
`
