"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const create_worksheet_detail_1 = require("./create-worksheet-detail");
const delete_worksheet_detail_1 = require("./delete-worksheet-detail");
const generate_release_good_worksheet_details_1 = require("./generate-release-good-worksheet-details");
const check_progressing_pallet_1 = require("./check-progressing-pallet");
const generate_pallet_id_1 = require("./generate-pallet-id");
const update_worksheet_detail_1 = require("./update-worksheet-detail");
const worksheet_detail_1 = require("./worksheet-detail");
const worksheet_details_1 = require("./worksheet-details");
const worksheet_details_by_product_group_1 = require("./worksheet-details-by-product-group");
exports.Query = Object.assign(Object.assign(Object.assign(Object.assign(Object.assign({}, worksheet_details_1.worksheetDetailsResolver), worksheet_detail_1.worksheetDetailResolver), worksheet_details_by_product_group_1.worksheetDetailsByProductGroupResolver), check_progressing_pallet_1.checkProgressingPalletResolver), generate_pallet_id_1.generatePalletIdResolver);
exports.Mutation = Object.assign(Object.assign(Object.assign(Object.assign({}, update_worksheet_detail_1.updateWorksheetDetail), create_worksheet_detail_1.createWorksheetDetail), delete_worksheet_detail_1.deleteWorksheetDetail), generate_release_good_worksheet_details_1.generateReleaseGoodWorksheetDetailsResolver);
//# sourceMappingURL=index.js.map