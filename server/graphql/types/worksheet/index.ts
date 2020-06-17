import { ArrivalNoticeWorksheet } from './arrival-notice-worksheet'
import { ContactPointInfo } from './contact-point-info'
import { DeliveryInfo } from './delivery-info'
import { DeliveryOrderInfo } from './delivery-order-info'
import { DeliveryWorksheet } from './delivery-worksheet'
import { ExecutingWorksheet } from './executing-worksheet'
import { GoodsDeliveryNote } from './goods-delivery-note'
import { InventoryCheckWorksheet } from './inventory-check-worksheet'
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
  ): Worksheet @priviledge(category: "worksheet", priviledge: "mutation")

  updateWorksheet (
    id: String!
    patch: WorksheetPatch!
  ): Worksheet @priviledge(category: "worksheet", priviledge: "mutation")

  deleteWorksheet (
    id: String!
  ): Boolean @priviledge(category: "worksheet", priviledge: "mutation")

  generateArrivalNoticeWorksheet (
    arrivalNoticeNo: String!
    bufferLocation: ObjectRef!
  ): ArrivalNoticeWorksheet @priviledge(category: "worksheet_control", priviledge: "mutation")

  generatePutawayWorksheet (
    arrivalNoticeNo: String!
    inventories: [InventoryPatch]!
  ): Boolean

  generatePartialPutawayWorksheet (
    arrivalNoticeNo: String!
    inventories: [InventoryPatch]!
  ): Boolean

  generateReleaseGoodWorksheet (
    releaseGoodNo: String!
  ): ReleaseGoodWorksheet @priviledge(category: "worksheet_control", priviledge: "mutation")

  generateCycleCountWorksheet (
    selectedInventory: [InventoryPatch]
    executionDate: String!
  ): InventoryCheckWorksheet @priviledge(category: "worksheet_control", priviledge: "mutation")

  generateVasOrderWorksheet (
    vasNo: String!
  ): VasOrderWorksheet @priviledge(category: "worksheet_control", priviledge: "mutation")

  activateUnloading (
    worksheetNo: String!
    unloadingWorksheetDetails: [WorksheetDetailPatch]
  ): Worksheet @priviledge(category: "worksheet_control", priviledge: "mutation")

  activateCycleCount (
    worksheetNo: String!
    cycleCountWorksheetDetails: [WorksheetDetailPatch]
  ): Worksheet @priviledge(category: "worksheet_control", priviledge: "mutation")

  activatePutaway (
    worksheetNo: String!
    putawayWorksheetDetails: [WorksheetDetailPatch]
  ): Worksheet @priviledge(category: "worksheet_control", priviledge: "mutation")

  activateLoading (
    worksheetNo: String!
    loadingWorksheetDetails: [WorksheetDetailPatch]
  ): Worksheet @priviledge(category: "worksheet_control", priviledge: "mutation")

  activateReturn (
    worksheetNo: String!
    returnWorksheetDetails: [WorksheetDetailPatch]
  ): Worksheet @priviledge(category: "worksheet_control", priviledge: "mutation")

  activateVas (
    worksheetNo: String!
    vasWorksheetDetails: [WorksheetDetailPatch]
  ): Worksheet @priviledge(category: "worksheet_control", priviledge: "mutation")

  activatePicking (
    worksheetNo: String!
  ): Worksheet @priviledge(category: "worksheet_control", priviledge: "mutation")

  unload (
    worksheetDetailName: String!
    inventory: InventoryPatch!
  ): Boolean @priviledge(category: "worksheet_execute", priviledge: "mutation")

  cycleCountAdjustment (
    cycleCountNo: String!
    cycleCountWorksheetDetails: [WorksheetDetailPatch]
  ): Boolean

  undoUnloading (
    worksheetDetailName: String!
    palletId: String!
  ): Boolean @priviledge(category: "worksheet_execute", priviledge: "mutation")

  completeUnloadingPartially (
    arrivalNoticeNo: String!
    worksheetDetail: WorksheetDetailPatch!
  ): Boolean @priviledge(category: "worksheet_execute", priviledge: "mutation")

  completeUnloading (
    arrivalNoticeNo: String!
    worksheetDetails: [WorksheetDetailPatch]
  ): Boolean @priviledge(category: "worksheet_execute", priviledge: "mutation")

  completeLoading (
    releaseGoodNo: String!
    worksheetDetails: [WorksheetDetailPatch]
  ): Worksheet @priviledge(category: "worksheet_execute", priviledge: "mutation")

  putaway (
    worksheetDetailName: String!
    palletId: String!
    toLocation: String!
  ): Boolean @priviledge(category: "worksheet_execute", priviledge: "mutation")

  undoPutaway (
    worksheetDetailName: String!
    palletId: String!
  ): Boolean @priviledge(category: "worksheet_execute", priviledge: "mutation")

  returning (
    worksheetDetailName: String!
    palletId: String!
    toLocation: String!
  ): Boolean @priviledge(category: "worksheet_execute", priviledge: "mutation")

  loading (
    loadedWorksheetDetails: [LoadedWorksheetDetail]!
    releaseGoodNo: String!
    orderInfo: WorksheetPatch
  ): Boolean @priviledge(category: "worksheet_execute", priviledge: "mutation")

  undoLoading (
    deliveryOrder: ObjectRef!
    palletIds: [String]!
  ): Boolean @priviledge(category: "worksheet_execute", priviledge: "mutation")

  transfer (
    palletId: String!
    toPalletId: String!
    qty: Int!
  ): Boolean @priviledge(category: "worksheet_execute", priviledge: "mutation")

  completePutaway (
    arrivalNoticeNo: String!
  ): Boolean @priviledge(category: "worksheet_execute", priviledge: "mutation")

  completeReturn (
    releaseGoodNo: String!
  ): Boolean @priviledge(category: "worksheet_execute", priviledge: "mutation")

  picking (
    worksheetDetailName: String!
    palletId: String!
    locationName: String!
    releaseQty: Int!
  ): Boolean @priviledge(category: "worksheet_execute", priviledge: "mutation")

  inspecting (
    worksheetDetailName: String!
    palletId: String!
    locationName: String!
    inspectedQty: Int!
    inspectedWeight: Float!
  ): Boolean @priviledge(category: "worksheet_execute", priviledge: "mutation")

  undoInspection (
    worksheetDetailName: String!
  ): Boolean @priviledge(category: "worksheet_execute", priviledge: "mutation")

  completePicking (
    releaseGoodNo: String!
  ): Boolean @priviledge(category: "worksheet_execute", priviledge: "mutation")

  completeInspection (
    inventoryCheckNo: String!
  ): Boolean @priviledge(category: "worksheet_execute", priviledge: "mutation")

  executeVas (
    worksheetDetail: WorksheetDetailPatch!
    palletId: String
  ): Boolean @priviledge(category: "worksheet_execute", priviledge: "mutation")

  undoVas (
    worksheetDetail: WorksheetDetailPatch!
  ): Boolean @priviledge(category: "worksheet_execute", priviledge: "mutation")

  completeVas (
    orderNo: String!
    orderType: String!
  ): Boolean @priviledge(category: "worksheet_execute", priviledge: "mutation")

  repalletizing (
    worksheetDetailName: String!
    fromPalletIds: [String]!
    palletId: String!
    locationName: String!
  ): Boolean @priviledge(category: "worksheet_execute", priviledge: "mutation")

  undoRepalletizing (
    worksheetDetailName: String!
    palletId: String!
  ): Boolean @priviledge(category: "worksheet_execute", priviledge: "mutation")

  repackaging (
    worksheetDetailName: String!
    fromPalletId: String!
    toPalletId: String!
    locationName: String!
  ): Boolean @priviledge(category: "worksheet_execute", priviledge: "mutation")

  undoRepackaging (
    worksheetDetailName: String!
    fromPalletId: String!
    toPalletId: String!
  ): Boolean @priviledge(category: "worksheet_execute", priviledge: "mutation")

  proceedExtraProducts (
    ganNo: String!
    approvedProducts: [ObjectRef]!
    rejectedProducts: [ObjectRef]!
  ): Boolean @priviledge(category: "worksheet", priviledge: "mutation")

  replacePickingPallets (
    worksheetDetailName: String!
    inventories: [InventoryPatch]!
    returnLocation: String
  ): Boolean @priviledge(category: "worksheet_execute", priviledge: "mutation")

  pendingCancellationReleaseOrder (
    name: String!
  ): Boolean

  confirmCancellationReleaseOrder (
    name: String!
  ): Boolean

  assignVasInventories (
    worksheetDetailIds: [String]!
    inventories: [InventoryPatch]!
  ): Boolean

  undoPickingAssigment (
    worksheetNo: String!
    batchId: String!
    productName: String!
    packingType: String!
  ): Boolean @priviledge(category: "worksheet_execute", priviledge: "mutation")
`

export const Query = /* GraphQL */ `
  worksheets (
    filters: [Filter],
    pagination: Pagination,
    sortings: [Sorting]
  ): WorksheetList @priviledge(category: "worksheet", priviledge: "query")

  worksheet (
    name: String!
  ): Worksheet @priviledge(category: "worksheet", priviledge: "query")

  unloadingWorksheet (
    arrivalNoticeNo: String!
  ): ExecutingWorksheet @priviledge(category: "worksheet", priviledge: "query")

  unloadedInventories (
    worksheetDetailName: String!
  ): [Inventory] @priviledge(category: "worksheet", priviledge: "query")

  loadedInventories (
    releaseGoodNo: String!
  ): [OrderInventory] @priviledge(category: "worksheet", priviledge: "query")

  loadingWorksheet (
    releaseGoodNo: String!
  ): ExecutingWorksheet @priviledge(category: "worksheet", priviledge: "query")

  putawayWorksheet (
    arrivalNoticeNo: String!
  ): ExecutingWorksheet @priviledge(category: "worksheet", priviledge: "query")

  returnWorksheet (
    releaseGoodNo: String!
  ): ExecutingWorksheet @priviledge(category: "worksheet", priviledge: "query")

  vasWorksheet (
    orderNo: String!, orderType: String!
  ): ExecutingWorksheet @priviledge(category: "worksheet", priviledge: "query")

  deliveryOrderByWorksheet (
    name: String!
  ): GoodsDeliveryNote @priviledge(category: "worksheet", priviledge: "query")

  pickingWorksheet (
    releaseGoodNo: String!, locationSortingRules: [Sorting]
  ): ExecutingWorksheet @priviledge(category: "worksheet", priviledge: "query")

  cycleCountWorksheet (
    inventoryCheckNo: String!, locationSortingRules: [Sorting]
  ): ExecutingWorksheet @priviledge(category: "worksheet", priviledge: "query")

  vasCandidates (
    worksheetDetailId: String!
  ): [Inventory] @priviledge(category: "worksheet", priviledge: "query")

  inventoriesByPallet (
    filters: [Filter],
    pagination: Pagination,
    sortings: [Sorting],
    locationSortingRules: [Sorting]
  ): InventoryList @priviledge(category: "inventory", priviledge: "query")
`

export const Types = /* GraphQL */ [
  Worksheet,
  NewWorksheet,
  WorksheetPatch,
  WorksheetList,
  ArrivalNoticeWorksheet,
  ReleaseGoodWorksheet,
  InventoryCheckWorksheet,
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
