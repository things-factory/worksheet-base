import { gql } from 'apollo-server-koa'

export const NewWorksheet = gql`
  input NewWorksheet {
    name: String
    description: String
    type: String!
    worksheetDetails: [ObjectRef]
  }
`
