"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const apollo_server_koa_1 = require("apollo-server-koa");
exports.WorksheetDetailPatch = apollo_server_koa_1.gql `
  input WorksheetDetailPatch {
    name: String
    description: String
    seq: Int
    type: String
    worksheet: ObjectRef
    worker: ObjectRef
    initialBatchId: String
    hasBatchChanges: Boolean
    targetProduct: OrderProductPatch
    targetVas: OrderVasPatch
    targetInventory: OrderInventoryPatch
    fromLocation: ObjectRef
    toLocation: ObjectRef
    batchId: String
    palletQty: Int
    palletizingVasId: String
    palletizingDescription: String
    status: String
    remark: String
    issue: String
    cuFlag: String
  }
`;
//# sourceMappingURL=worksheet-detail-patch.js.map