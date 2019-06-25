import { gql } from 'apollo-server-koa'

export const WorksheetMovementPatch = gql`
  input WorksheetMovementPatch {
    name: String
    description: String
  }
`
