import { ArrivalNoticeWorksheet } from './arrival-notice-worksheet'
import { DeliveryInfo } from './delivery-info'
import { DeliveryWorksheet } from './delivery-worksheet'
import { ExecutingWorksheet } from './executing-worksheet'
import { DeliveryOrderInfo } from './delivery-order-info'
import { ContactPointInfo } from './contact-point-info'
import { GoodsDeliveryNote } from './goods-delivery-note'
import { LoadedWorksheetDetail } from './loaded-worksheet-detail'
import { NewWorksheet } from './new-worksheet'
import { ReleaseGoodWorksheet } from './release-good-worksheet'
import { VasOrderWorksheet } from './vas-order-worksheet'
import { Worksheet } from './worksheet'
import { WorksheetDetailInfo } from './worksheet-detail-info'
import { WorksheetInfo } from './worksheet-info'
import { WorksheetList } from './worksheet-list'
import { WorksheetPatch } from './worksheet-patch'

export const Mutation = /* GraphQL */ `
  createWorksheet (
    worksheet: NewWorksheet!
  ): Worksheet

  updateWorksheet (
    id: String!
    patch: WorksheetPatch!
  ): Worksheet

  deleteWorksheet (
    id: String!
  ): Boolean

  generateArrivalNoticeWorksheet (
    arrivalNoticeNo: String!
    bufferLocation: ObjectRef!
  ): ArrivalNoticeWorksheet

  generateReleaseGoodWorksheet (
    releaseGoodNo: String!
  ): ReleaseGoodWorksheet

  generateVasOrderWorksheet (
    vasNo: String!
  ): VasOrderWorksheet

  activateUnloading (
    worksheetNo: String!
    unloadingWorksheetDetails: [WorksheetDetailPatch]
  ): Worksheet

  activatePutaway (
    worksheetNo: String!
    putawayWorksheetDetails: [WorksheetDetailPatch]
  ): Worksheet

  activateLoading (
    worksheetNo: String!
    loadingWorksheetDetails: [WorksheetDetailPatch]
  ): Worksheet

  activateReturn (
    worksheetNo: String!
    returnWorksheetDetails: [WorksheetDetailPatch]
  ): Worksheet

  activateVas (
    worksheetNo: String!
    vasWorksheetDetails: [WorksheetDetailPatch]
  ): Worksheet

  activatePicking (
    worksheetNo: String!
  ): Worksheet

  unload (
    worksheetDetailName: String!
    inventory: InventoryPatch!
  ): Boolean

  undoUnloading (
    worksheetDetailName: String!
    palletId: String!
  ): Boolean

  completeUnloading (
    arrivalNoticeNo: String!
    worksheetDetails: [WorksheetDetailPatch]
  ): Worksheet

  completeLoading (
    releaseGoodNo: String!
    worksheetDetails: [WorksheetDetailPatch]
  ): Worksheet

  putaway (
    worksheetDetailName: String!
    palletId: String!
    toLocation: String!
  ): Boolean

  returning (
    worksheetDetailName: String!
    palletId: String!
    toLocation: String!
  ): Boolean

  loading (
    loadedWorksheetDetails: [LoadedWorksheetDetail]!
    releaseGoodNo: String!
    orderInfo: WorksheetPatch
  ): Boolean

  undoLoading (
    deliveryOrder: ObjectRef!
    palletIds: [String]!
  ): Boolean

  transfer (
    palletId: String!
    toPalletId: String!
    qty: Int!
  ): Boolean

  completePutaway (
    arrivalNoticeNo: String!
  ): Boolean

  completeReturn (
    releaseGoodNo: String!
  ): Boolean

  picking (
    worksheetDetailName: String!
    palletId: String!
    locationName: String!
    releaseQty: Int!
  ): Boolean

  completePicking (
    releaseGoodNo: String!
  ): Boolean

  executeVas (
    worksheetDetail: WorksheetDetailPatch!
  ): Boolean

  undoVas (
    worksheetDetail: WorksheetDetailPatch!
  ): Boolean

  completeVas (
    orderNo: String!
    orderType: String!
  ): Boolean

  proceedExtraProducts (
    ganNo: String!
    approvedProducts: [ObjectRef]!
    rejectedProducts: [ObjectRef]!
  ): Boolean
`

export const Query = /* GraphQL */ `
  worksheets(filters: [Filter], pagination: Pagination, sortings: [Sorting]): WorksheetList
  worksheet(name: String!): Worksheet
  unloadingWorksheet(arrivalNoticeNo: String!): ExecutingWorksheet
  unloadedInventories(worksheetDetailName: String!): [Inventory]
  loadedInventories(releaseGoodNo: String!): [OrderInventory]
  loadingWorksheet(releaseGoodNo: String!): ExecutingWorksheet
  putawayWorksheet(arrivalNoticeNo: String!): ExecutingWorksheet
  returnWorksheet(releaseGoodNo: String!): ExecutingWorksheet
  vasWorksheet(orderNo: String!, orderType: String!): ExecutingWorksheet
  deliveryOrderByWorksheet(name: String!): GoodsDeliveryNote
  pickingWorksheet(releaseGoodNo: String!, locationSortingRules: [Sorting]): ExecutingWorksheet
`

export const Types = [
  Worksheet,
  NewWorksheet,
  WorksheetPatch,
  WorksheetList,
  ArrivalNoticeWorksheet,
  ReleaseGoodWorksheet,
  DeliveryOrderInfo,
  GoodsDeliveryNote,
  ContactPointInfo,
  VasOrderWorksheet,
  WorksheetInfo,
  DeliveryInfo,
  DeliveryWorksheet,
  WorksheetDetailInfo,
  ExecutingWorksheet,
  LoadedWorksheetDetail
]
