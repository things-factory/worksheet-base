"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const apollo_server_koa_1 = require("apollo-server-koa");
exports.ProductApproval = apollo_server_koa_1.gql `
  input ProductApproval {
    id: String!
    adjustedBatchId: String!
    batchId: String!
    product: ObjectRef
  }
`;
//# sourceMappingURL=product-approval.js.map