"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const apollo_server_koa_1 = require("apollo-server-koa");
exports.DeliveryOrderInfo = apollo_server_koa_1.gql `
  type DeliveryOrderInfo {
    ownCollection: Boolean
    doStatus: String
    truckNo: String
  }
`;
//# sourceMappingURL=delivery-order-info.js.map