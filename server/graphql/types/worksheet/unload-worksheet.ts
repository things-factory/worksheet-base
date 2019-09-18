import { gql } from 'apollo-server-koa'

export const UnloadWorksheet = gql`
  type UnloadWorksheet {
    unloadWorksheetInfo: UnloadWorksheetInfo
    unloadWorksheetDetails: [UnloadWorksheetDetail]
  }
`
