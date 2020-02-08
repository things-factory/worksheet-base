import { gql } from 'apollo-server-koa'

export const WorksheetPatch = gql`
  input WorksheetPatch {
    name: String
    description: String
    type: String
    worksheetDetails: [ObjectRef]
    status: String
    truckNo: String
    palletQty: String
    ownCollection: Boolean
    cuFlag: String
  }
`
