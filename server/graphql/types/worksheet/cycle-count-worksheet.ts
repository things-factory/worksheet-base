import { gql } from 'apollo-server-koa'

export const CycleCountWorksheet = gql`
  type CycleCountWorksheet {
    name: String
    palletId: String
    currentLocation: String
    batchId: String
    uom: String
    uomValue: Float
    productName: String
    productDescription: String
    qty: Int
  }
`
