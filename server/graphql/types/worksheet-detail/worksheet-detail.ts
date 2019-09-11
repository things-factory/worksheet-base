import { gql } from 'apollo-server-koa'

export const WorksheetDetail = gql`
  type WorksheetDetail {
    id: String
    domain: Domain
    bizplace: Bizplace
    name: String
    description: String
    type: String
    worksheet: Worksheet
    worker: Worker
    fromLocation: Location
    toLocation: Location
    targetProduct: OrderProduct
    targetVas: OrderVas
    remark: String
    status: String
    creator: User
    updater: User
    createdAt: String
    updatedAt: String
  }
`
