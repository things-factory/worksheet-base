"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const apollo_server_koa_1 = require("apollo-server-koa");
exports.WorksheetInfo = apollo_server_koa_1.gql `
  type WorksheetInfo {
    releaseGood: ReleaseGood
    bizplaceName: String
    containerNo: String
    bufferLocation: String
    startedAt: String
    ownCollection: Boolean
    palletId: String
    refNo: String
  }
`;
//# sourceMappingURL=worksheet-info.js.map