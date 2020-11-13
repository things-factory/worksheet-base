import { gql } from 'apollo-server-koa'

export const WorksheetInfo = gql`
  type WorksheetInfo {
    releaseGood: ReleaseGood
    returnOrder: ReturnOrder
    bizplaceName: String
    bizplace: Bizplace
    containerNo: String
    bufferLocation: String
    startedAt: String
    ownCollection: Boolean
    palletId: String
    refNo: String
    looseItem: String
    orderVas: [WorksheetDetail]
  }
`
