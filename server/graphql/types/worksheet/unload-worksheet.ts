import { gql } from 'apollo-server-koa'

export const UnloadWorksheet = gql`
  type UnloadWorksheet {
    arrivalNotice: ArrivalNotice
    unloadWorksheetInfo: UnloadWorksheetInfo
    unloadWorksheetDetails: [UnloadWorksheetDetail]
  }
`
