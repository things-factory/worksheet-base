import { ArrivalNoticeWorksheet } from './arrival-notice-worksheet'
import { NewWorksheet } from './new-worksheet'
import { UnloadWorksheet } from './unload-worksheet'
import { UnloadWorksheetDetail } from './unload-worksheet-detail'
import { UnloadWorksheetInfo } from './unload-worksheet-info'
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
  ): ArrivalNoticeWorksheet

  activateUnloading (
    name: String!
    productWorksheetDetails: [WorksheetDetailPatch]
  ): Worksheet

  completeUnloading (
    arrivalNoticeNo: String!
    worksheetDetails: [WorksheetDetailPatch]!
  ): Worksheet
`

export const Query = `
  worksheets(filters: [Filter], pagination: Pagination, sortings: [Sorting]): WorksheetList
  worksheet(name: String!): Worksheet
  unloadWorksheet(arrivalNoticeNo: String!): UnloadWorksheet
`

export const Types = [
  Worksheet,
  NewWorksheet,
  WorksheetPatch,
  WorksheetList,
  UnloadWorksheet,
  UnloadWorksheetInfo,
  UnloadWorksheetDetail,
  ArrivalNoticeWorksheet
]
