"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const apollo_server_koa_1 = require("apollo-server-koa");
exports.ArrivalNoticeWorksheet = apollo_server_koa_1.gql `
  type ArrivalNoticeWorksheet {
    unloadingWorksheet: Worksheet
    vasWorksheet: Worksheet
  }
`;
//# sourceMappingURL=arrival-notice-worksheet.js.map