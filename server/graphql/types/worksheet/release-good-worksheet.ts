import { gql } from 'apollo-server-koa'

export const ReleaseGoodWorksheet = gql`
  type ReleaseGoodWorksheet {
    pickingWorksheet: Worksheet
    vasWorksheet: Worksheet
  }
`
