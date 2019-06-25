import { gql } from 'apollo-server-koa'

export const WorksheetPatch = gql`
  input WorksheetPatch {
    name: String
    description: String
  }
`
