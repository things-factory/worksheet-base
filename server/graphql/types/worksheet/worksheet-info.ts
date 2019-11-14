import { gql } from 'apollo-server-koa'

export const WorksheetInfo = gql`
  type WorksheetInfo {
    bizplaceName: String
    containerNo: String
    bufferLocation: String
    startedAt: String
    refNo: String
  }
`
