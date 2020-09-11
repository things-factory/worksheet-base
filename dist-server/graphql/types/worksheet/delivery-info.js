"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const apollo_server_koa_1 = require("apollo-server-koa");
exports.DeliveryInfo = apollo_server_koa_1.gql `
  type DeliveryInfo {
    palletId: String
    batchId: String
    product: Product
    truckNo: String
    driver: String
  }
`;
//# sourceMappingURL=delivery-info.js.map