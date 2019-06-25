import { WorksheetDetail } from './worksheet-detail'
import { NewWorksheetDetail } from './new-worksheet-detail'
import { WorksheetDetailPatch } from './worksheet-detail-patch'
import { WorksheetDetailList } from './worksheet-detail-list'
import { Filter, Pagination, Sorting } from '@things-factory/shell'

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
  ): WorksheetDetail

  publishWorksheetDetail (
    id: String!
  ): WorksheetDetail
`

export const Query = `
  worksheetDetails(filters: [Filter], pagination: Pagination, sortings: [Sorting]): WorksheetDetailList
  worksheetDetail(id: String!): WorksheetDetail
`

export const Types = [Filter, Pagination, Sorting, WorksheetDetail, NewWorksheetDetail, WorksheetDetailPatch, WorksheetDetailList]
