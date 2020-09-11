"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const apollo_server_koa_1 = require("apollo-server-koa");
exports.WorksheetList = apollo_server_koa_1.gql `
  type WorksheetList {
    items: [Worksheet]
    total: Int
  }
`;
//# sourceMappingURL=worksheet-list.js.map