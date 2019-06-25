import { gql } from 'apollo-server-koa'

export const WorksheetMovement = gql`
  type WorksheetMovement {
    id: String
    name: String
    domain: Domain
    description: String
  }
`
