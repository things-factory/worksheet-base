import { gql } from 'apollo-server-koa'

export const WorksheetInfo = gql`
  type WorksheetInfo {
    bizplace: Bizplace
    containerNo: String
    bufferLocation: String
    startedAt: String
  }
`
