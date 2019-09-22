import { gql } from 'apollo-server-koa'

export const ExecutingWorksheet = gql`
  type ExecutingWorksheet {
    worksheetInfo: [WorksheetInfo]
    worksheetDetailInfos: [WorksheetDetailInfo]
  }
`
