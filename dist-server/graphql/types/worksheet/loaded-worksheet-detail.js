"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const apollo_server_koa_1 = require("apollo-server-koa");
exports.LoadedWorksheetDetail = apollo_server_koa_1.gql `
  input LoadedWorksheetDetail {
    name: String!
    loadedQty: Float!
  }
`;
//# sourceMappingURL=loaded-worksheet-detail.js.map