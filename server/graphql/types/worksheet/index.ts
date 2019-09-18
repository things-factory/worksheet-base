import { NewWorksheet } from './new-worksheet'
import { Worksheet } from './worksheet'
import { WorksheetList } from './worksheet-list'
import { WorksheetPatch } from './worksheet-patch'

export const Mutation = `
  createWorksheet (
    worksheet: NewWorksheet!
  ): Worksheet

  updateWorksheet (
    name: String!
    patch: WorksheetPatch!
  ): Worksheet

  deleteWorksheet (
    name: String!
  ): Boolean

  generateArrivalNoticeWorksheet (
    arrivalNotice: ObjectRef!
    bufferLocation: ObjectRef!
  ): Worksheet

  activateUnloading (
    name: String!
    productWorksheetDetails: [WorksheetDetailPatch]
    vasWorksheetDetails: [WorksheetDetailPatch]
    : [WorksheetDetailPatch]
  ): Worksheet
`

export const Query = `
  worksheets(filters: [Filter], pagination: Pagination, sortings: [Sorting]): WorksheetList
  worksheet(name: String!): Worksheet
`

export const Types = [Worksheet, NewWorksheet, WorksheetPatch, WorksheetList]
