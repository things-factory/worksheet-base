import { gql } from 'apollo-server-koa'

export const WorksheetInfo = gql`
  type WorksheetInfo {
    releaseGood: ReleaseGood
    bizplaceName: String
    containerNo: String
    bufferLocation: String
    startedAt: String
    ownCollection: Boolean
    palletId: String
    refNo: String
  }
`
