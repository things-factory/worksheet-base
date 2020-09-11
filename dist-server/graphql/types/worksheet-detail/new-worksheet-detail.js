"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const apollo_server_koa_1 = require("apollo-server-koa");
exports.NewWorksheetDetail = apollo_server_koa_1.gql `
  input NewWorksheetDetail {
    name: String
    description: String
    seq: Int
    type: String
    worksheet: ObjectRef
    worker: ObjectRef
    targetProduct: ObjectRef
    targetVas: ObjectRef
    targetInventory: OrderInventoryPatch
    fromLocation: ObjectRef
    toLocation: ObjectRef
    status: String
    remark: String
    issue: String
  }
`;
//# sourceMappingURL=new-worksheet-detail.js.map