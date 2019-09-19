import { gql } from 'apollo-server-koa'

export const ArrivalNoticeWorksheet = gql`
  type ArrivalNoticeWorksheet {
    unloadingWorksheet: Worksheet
    vasWorksheet: Worksheet
  }
`
