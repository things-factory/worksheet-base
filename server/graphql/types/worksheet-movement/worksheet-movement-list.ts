import { gql } from 'apollo-server-koa'

export const WorksheetMovementList = gql`
  type WorksheetMovementList {
    items: [WorksheetMovement]
    total: Int
  }
`
