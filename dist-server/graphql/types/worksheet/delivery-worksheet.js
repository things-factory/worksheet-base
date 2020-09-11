"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const apollo_server_koa_1 = require("apollo-server-koa");
exports.DeliveryWorksheet = apollo_server_koa_1.gql `
  type DeliveryWorksheet {
    deliveryInfo: [DeliveryInfo]
  }
`;
//# sourceMappingURL=delivery-worksheet.js.map