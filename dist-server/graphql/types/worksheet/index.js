"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const arrival_notice_worksheet_1 = require("./arrival-notice-worksheet");
const contact_point_info_1 = require("./contact-point-info");
const delivery_info_1 = require("./delivery-info");
const delivery_order_info_1 = require("./delivery-order-info");
const delivery_worksheet_1 = require("./delivery-worksheet");
const executing_worksheet_1 = require("./executing-worksheet");
const goods_delivery_note_1 = require("./goods-delivery-note");
const inventory_check_worksheet_1 = require("./inventory-check-worksheet");
const loaded_worksheet_detail_1 = require("./loaded-worksheet-detail");
const new_worksheet_1 = require("./new-worksheet");
const release_good_worksheet_1 = require("./release-good-worksheet");
const vas_order_worksheet_1 = require("./vas-order-worksheet");
const worksheet_1 = require("./worksheet");
const worksheet_detail_info_1 = require("./worksheet-detail-info");
const worksheet_info_1 = require("./worksheet-info");
const worksheet_list_1 = require("./worksheet-list");
const worksheet_patch_1 = require("./worksheet-patch");
const product_approval_1 = require("./product-approval");
exports.Mutation = `
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

  editBatchNo (
    worksheetNo: String!
    unloadingWorksheetDetails: [WorksheetDetailPatch]
  ): Worksheet @priviledge(category: "worksheet_execute", priviledge: "mutation")

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

  preunload (
    worksheetDetailName: String!
    adjustedBatchId: String
    adjustedPalletQty: Int!
    palletQty: Int
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

  completePreunload (
    arrivalNoticeNo: String!
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

  undoPreunload (
    worksheetDetailName: String!
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

  crossDockPicking (
    worksheetDetailName: String!
    palletId: String!
    releaseQty: Int!
  ): Boolean @priviledge(category: "worksheet_execute", priviledge: "mutation")

  inspecting (
    worksheetDetailName: String!
    palletId: String!
    locationName: String!
    inspectedQty: Int!
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
    fromPalletId: String!
    toPalletId: String!
    locationName: String!
  ): Boolean @priviledge(category: "worksheet_execute", priviledge: "mutation")

  undoRepalletizing (
    worksheetDetailName: String!
    fromPalletId: String!
    toPalletId: String!
  ): Boolean @priviledge(category: "worksheet_execute", priviledge: "mutation")

  repackaging (
    worksheetDetailName: String!
    fromPalletId: String!
    toPalletId: String!
    locationName: String!
    packageQty: Int!
  ): Boolean @priviledge(category: "worksheet_execute", priviledge: "mutation")

  undoRepackaging (
    worksheetDetailName: String!
    fromPalletId: String!
    toPalletId: String!
  ): Boolean @priviledge(category: "worksheet_execute", priviledge: "mutation")

  relabeling (
    worksheetDetailName: String!
    fromPalletId: String!
    toPalletId: String!
    locationName: String
  ): Boolean @priviledge(category: "worksheet_execute", priviledge: "mutation")

  undoRelabeling (
    worksheetDetailName: String!
    toPalletId: String!
  ): Boolean @priviledge(category: "worksheet_execute", priviledge: "mutation")

  proceedExtraProducts (
    ganNo: String!
    approvedProducts: [ObjectRef]!
    rejectedProducts: [ObjectRef]!
  ): Boolean @priviledge(category: "worksheet", priviledge: "mutation")

  proceedEditedBatch (
    ganNo: String!
    approvedProducts: [ProductApproval]!
    rejectedProducts: [ProductApproval]!
  ): Boolean @priviledge(category: "worksheet_customer", priviledge: "mutation")

  submitAdjustmentForApproval (
    name: String!
  ): Boolean @priviledge(category: "worksheet_control", priviledge: "mutation")

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
  ): Boolean @priviledge(category: "worksheet_control", priviledge: "mutation")

  rejectCancellationReleaseOrder (
    name: String!
  ): Boolean @priviledge(category: "worksheet_control", priviledge: "mutation")

  assignVasInventories (
    worksheetDetailIds: [String]!
    inventories: [InventoryPatch]!
  ): Boolean

  undoPickingAssigment (
    worksheetNo: String!
    batchId: String!
    productId: String!
    packingType: String!
  ): Boolean @priviledge(category: "worksheet_control", priviledge: "mutation")
`;
exports.Query = `
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

  preunloadWorksheet (
    arrivalNoticeNo: String!
  ): ExecutingWorksheet @priviledge(category: "worksheet", priviledge: "query")

  unloadedInventories (
    worksheetDetailName: String!
  ): [Inventory] @priviledge(category: "worksheet", priviledge: "query")

  unloadedInventoriesByReusablePallet (
    reusablePalletId: String!
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

  checkRelabelable (
    batchId: String!,
    productId: String!,
    packingType: String!,
    unitWeight: Int!
  ): Boolean @priviledge(category: "inventory", priviledge: "query")

  havingVas (
    orderType: String!
    orderNo: String!
  ): Worksheet @priviledge(category: "worksheet", priviledge: "query")

  worksheetByOrderNo (
    orderType: String!
    orderNo: String!
  ): Worksheet @priviledge(category: "worksheet", priviledge: "query")
`;
exports.Types = [
    worksheet_1.Worksheet,
    new_worksheet_1.NewWorksheet,
    worksheet_patch_1.WorksheetPatch,
    worksheet_list_1.WorksheetList,
    arrival_notice_worksheet_1.ArrivalNoticeWorksheet,
    release_good_worksheet_1.ReleaseGoodWorksheet,
    inventory_check_worksheet_1.InventoryCheckWorksheet,
    delivery_order_info_1.DeliveryOrderInfo,
    goods_delivery_note_1.GoodsDeliveryNote,
    contact_point_info_1.ContactPointInfo,
    vas_order_worksheet_1.VasOrderWorksheet,
    worksheet_info_1.WorksheetInfo,
    delivery_info_1.DeliveryInfo,
    delivery_worksheet_1.DeliveryWorksheet,
    worksheet_detail_info_1.WorksheetDetailInfo,
    executing_worksheet_1.ExecutingWorksheet,
    loaded_worksheet_detail_1.LoadedWorksheetDetail,
    product_approval_1.ProductApproval
];
//# sourceMappingURL=index.js.map