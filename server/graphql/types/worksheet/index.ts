import { ArrivalNoticeWorksheet } from './arrival-notice-worksheet'
import { ExecutingWorksheet } from './executing-worksheet'
import { NewWorksheet } from './new-worksheet'
import { Worksheet } from './worksheet'
import { WorksheetDetailInfo } from './worksheet-detail-info'
import { WorksheetInfo } from './worksheet-info'
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
    arrivalNoticeNo: String!
    bufferLocation: ObjectRef!
  ): ArrivalNoticeWorksheet

  activateUnloading (
    worksheetNo: String!
    unloadingWorksheetDetails: [WorksheetDetailPatch]
  ): Worksheet

  activatePutaway (
    worksheetNo: String!
    putawayWorksheetDetails: [WorksheetDetailPatch]
  ): Worksheet

  activateVas (
    worksheetNo: String!
    vasWorksheetDetails: [WorksheetDetailPatch]
  ): Worksheet

  completeUnloading (
    arrivalNoticeNo: String!
    unloadingWorksheetDetails: [WorksheetDetailPatch]!
    unloadedPallets: [InventoryPatch]!
  ): Worksheet

  completePutaway (
    arrivalNoticeNo: String!
    putawayWorksheetDetails: [WorksheetDetailPatch]!
  ): Worksheet

  completeVas (
    orderNo: String!
    orderType: String!
    vasWorksheetDetails: [WorksheetDetailPatch]!
  ): Worksheet
`

export const Query = `
  worksheets(filters: [Filter], pagination: Pagination, sortings: [Sorting]): WorksheetList
  worksheet(name: String!): Worksheet
  unloadingWorksheet(arrivalNoticeNo: String!): ExecutingWorksheet
  putawayWorksheet(arrivalNoticeNo: String!): ExecutingWorksheet
  vasWorksheet(orderNo: String!, orderType: String!): ExecutingWorksheet
`

export const Types = [
  Worksheet,
  NewWorksheet,
  WorksheetPatch,
  WorksheetList,
  ArrivalNoticeWorksheet,
  WorksheetInfo,
  WorksheetDetailInfo,
  ExecutingWorksheet
]
