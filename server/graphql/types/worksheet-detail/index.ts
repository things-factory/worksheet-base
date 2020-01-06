import { NewWorksheetDetail } from './new-worksheet-detail'
import { WorksheetDetail } from './worksheet-detail'
import { WorksheetDetailList } from './worksheet-detail-list'
import { WorksheetDetailPatch } from './worksheet-detail-patch'

export const Mutation = `
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
`

export const Query = `
  worksheetDetails(filters: [Filter], pagination: Pagination, sortings: [Sorting]): WorksheetDetailList
  worksheetDetail(name: String!): WorksheetDetail
`

export const Types = [WorksheetDetail, NewWorksheetDetail, WorksheetDetailPatch, WorksheetDetailList]
