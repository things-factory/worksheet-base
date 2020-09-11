"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const apollo_server_koa_1 = require("apollo-server-koa");
exports.WorksheetDetail = apollo_server_koa_1.gql `
  type WorksheetDetail {
    id: String
    domain: Domain
    bizplace: Bizplace
    name: String
    description: String
    seq: Int
    type: String
    worksheet: Worksheet
    worker: Worker
    targetProduct: OrderProduct
    targetVas: OrderVas
    targetInventory: OrderInventory
    targetDO: DeliveryOrder
    location: Location
    fromLocation: Location
    toLocation: Location
    status: String
    remark: String
    issue: String
    creator: User
    updater: User
    createdAt: String
    updatedAt: String
  }
`;
//# sourceMappingURL=worksheet-detail.js.map