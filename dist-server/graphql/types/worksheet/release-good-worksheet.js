"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const apollo_server_koa_1 = require("apollo-server-koa");
exports.ReleaseGoodWorksheet = apollo_server_koa_1.gql `
  type ReleaseGoodWorksheet {
    pickingWorksheet: Worksheet
    vasWorksheet: Worksheet
  }
`;
//# sourceMappingURL=release-good-worksheet.js.map