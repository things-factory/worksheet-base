import { gql } from 'apollo-server-koa'

export const LoadedWorksheetDetail = gql`
  input LoadedWorksheetDetail {
    name: String!
    loadedQty: Int!
  }
`
