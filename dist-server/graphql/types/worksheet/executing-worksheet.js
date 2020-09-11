"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const apollo_server_koa_1 = require("apollo-server-koa");
exports.ExecutingWorksheet = apollo_server_koa_1.gql `
  type ExecutingWorksheet {
    worksheetInfo: WorksheetInfo
    worksheetDetailInfos: [WorksheetDetailInfo]
  }
`;
//# sourceMappingURL=executing-worksheet.js.map