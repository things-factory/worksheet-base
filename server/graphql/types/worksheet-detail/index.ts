import { NewWorksheetDetail } from './new-worksheet-detail'
import { WorksheetDetail } from './worksheet-detail'
import { WorksheetDetailList } from './worksheet-detail-list'
import { WorksheetDetailPatch } from './worksheet-detail-patch'

export const Mutation = /* GraphQL */ `
  createWorksheetDetail (
    worksheetDetail: NewWorksheetDetail!
  ): WorksheetDetail

  updateWorksheetDetail (
    id: String!
    patch: WorksheetDetailPatch!
  ): WorksheetDetail

  deleteWorksheetDetail (
    id: String!
  ): Boolean

  generateReleaseGoodWorksheetDetails (
    worksheetNo: String!
    batchId: String!
    productName: String!
    packingType: String!
    orderInventories: [NewOrderInventory]
  ): Boolean
`

export const Query = /* GraphQL */ `
  worksheetDetails(filters: [Filter], pagination: Pagination, sortings: [Sorting]): WorksheetDetailList
  worksheetDetail(name: String!): WorksheetDetail
  worksheetDetailsByProductGroup(worksheet: String!, batchId: String!, productName: String!, packingType: String!): WorksheetDetailList
`

export const Types = [WorksheetDetail, NewWorksheetDetail, WorksheetDetailPatch, WorksheetDetailList]
