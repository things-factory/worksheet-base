"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const graphql_tag_1 = __importDefault(require("graphql-tag"));
exports.InventoryDetail = graphql_tag_1.default `
  type InventoryDetail {
    id: String
    domain: Domain
    bizplace: Bizplace
    refInventory: Inventory
    name: String
    palletId: String
    batchId: String
    product: Product
    location: Location
    warehouse: Warehouse
    zone: String
    packingType: String
    qty: Int
    remainQty: Int
    otherRef: String
    lastSeq: Int
    weight: Float
    remainWeight: Float
    unit: String
    status: String
    description: String
    creator: User
    updater: User
    createdAt: String
    updatedAt: String
  }
`;
//# sourceMappingURL=inventory-detail.js.map