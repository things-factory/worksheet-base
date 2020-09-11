"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const apollo_server_koa_1 = require("apollo-server-koa");
exports.WorksheetMovementList = apollo_server_koa_1.gql `
  type WorksheetMovementList {
    items: [WorksheetMovement]
    total: Int
  }
`;
//# sourceMappingURL=worksheet-movement-list.js.map