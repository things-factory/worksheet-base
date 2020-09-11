"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const new_worksheet_detail_1 = require("./new-worksheet-detail");
const worksheet_detail_1 = require("./worksheet-detail");
const worksheet_detail_list_1 = require("./worksheet-detail-list");
const worksheet_detail_patch_1 = require("./worksheet-detail-patch");
const pallet_info_1 = require("./pallet-info");
const inventory_detail_1 = require("./inventory-detail");
exports.Mutation = `
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
    productId: String!
    packingType: String!
    worksheetDetails: [NewWorksheetDetail]
  ): Boolean
`;
exports.Query = `
  worksheetDetails(filters: [Filter], pagination: Pagination, sortings: [Sorting]): WorksheetDetailList
  worksheetDetail(name: String!): WorksheetDetail
  checkProgressingPallet(palletId: String!): Boolean
  generatePalletId(targets: [PalletInfo]): [InventoryDetail]
  worksheetDetailsByProductGroup(worksheetNo: String!, batchId: String!, productName: String!, packingType: String!): WorksheetDetailList
`;
exports.Types = [
    worksheet_detail_1.WorksheetDetail,
    new_worksheet_detail_1.NewWorksheetDetail,
    worksheet_detail_patch_1.WorksheetDetailPatch,
    worksheet_detail_list_1.WorksheetDetailList,
    pallet_info_1.PalletInfo,
    inventory_detail_1.InventoryDetail
];
//# sourceMappingURL=index.js.map