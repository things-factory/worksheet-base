import { gql } from 'apollo-server-koa'

export const UnloadWorksheetInfo = gql`
  type UnloadWorksheetInfo {
    name: String
    status: String
    bufferLocation: Location
    startedAt: String
    bizplace: Bizplace
  }
`
