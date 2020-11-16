import { gql } from 'apollo-server-koa'

export const CycleCountWorksheet = gql`
  type CycleCountWorksheet {
    name: String
  }
`
