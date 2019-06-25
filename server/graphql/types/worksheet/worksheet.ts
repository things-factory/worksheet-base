import { gql } from 'apollo-server-koa'

export const Worksheet = gql`
  type Worksheet {
    id: String
    name: String
    domain: Domain
    description: String
  }
`
