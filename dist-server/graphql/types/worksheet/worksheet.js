"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const apollo_server_koa_1 = require("apollo-server-koa");
exports.Worksheet = apollo_server_koa_1.gql `
  type Worksheet {
    id: String
    domain: Domain
    bizplace: Bizplace
    bufferLocation: Location
    arrivalNotice: ArrivalNotice
    orderProducts: [OrderProduct]
    releaseGood: ReleaseGood
    inventoryCheck: InventoryCheck
    orderInventories: [OrderInventory]
    shippingOrder: ShippingOrder
    vasOrder: VasOrder
    orderVass: [OrderVas]
    name: String
    description: String
    type: String
    worksheetDetails: [WorksheetDetail]
    status: String
    startedAt: String
    endedAt: String
    creator: User
    updater: User
    createdAt: String
    updatedAt: String
  }
`;
//# sourceMappingURL=worksheet.js.map