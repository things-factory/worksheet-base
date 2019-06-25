import { gql } from 'apollo-server-koa'

export const NewWorksheetMovement = gql`
  input NewWorksheetMovement {
    name: String!
    description: String
  }
`
