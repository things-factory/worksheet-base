import { gql } from 'apollo-server-koa'

export const WorksheetInfo = gql`
  type WorksheetInfo {
    releaseGood: ReleaseGood
    bizplaceName: String
    bizplace: Bizplace
    containerNo: String
    bufferLocation: String
    startedAt: String
    ownCollection: Boolean
    palletId: String
    refNo: String
  }
`
