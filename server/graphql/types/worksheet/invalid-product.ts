import { gql } from 'apollo-server-koa'

export const InvalidProduct = gql`
  input InvalidProduct {
    worksheetDetail: WorksheetDetail!
    orderProduct: OrderProduct!
  }
`
