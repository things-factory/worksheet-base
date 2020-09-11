"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const apollo_server_koa_1 = require("apollo-server-koa");
exports.GoodsDeliveryNote = apollo_server_koa_1.gql `
  type GoodsDeliveryNote {
    deliveryOrderInfo: DeliveryOrderInfo
    contactPointInfo: [ContactPointInfo]
  }
`;
//# sourceMappingURL=goods-delivery-note.js.map