"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const apollo_server_koa_1 = require("apollo-server-koa");
exports.WorksheetPatch = apollo_server_koa_1.gql `
  input WorksheetPatch {
    name: String
    description: String
    type: String
    worksheetDetails: [ObjectRef]
    initialBatchId: String
    status: String
    truckNo: String
    palletQty: String
    ownCollection: Boolean
    cuFlag: String
  }
`;
//# sourceMappingURL=worksheet-patch.js.map