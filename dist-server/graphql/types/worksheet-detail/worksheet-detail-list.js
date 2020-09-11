"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const apollo_server_koa_1 = require("apollo-server-koa");
exports.WorksheetDetailList = apollo_server_koa_1.gql `
  type WorksheetDetailList {
    items: [WorksheetDetail]
    total: Int
  }
`;
//# sourceMappingURL=worksheet-detail-list.js.map