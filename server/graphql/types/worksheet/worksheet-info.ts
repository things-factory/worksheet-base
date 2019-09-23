import { gql } from 'apollo-server-koa'

export const WorksheetInfo = gql`
  type WorksheetInfo {
    orderType: String
    bizplaceName: String
    containerNo: String
    bufferLocation: String
    startedAt: String
  }
`
