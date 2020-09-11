"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const apollo_server_koa_1 = require("apollo-server-koa");
exports.VasWorksheet = apollo_server_koa_1.gql `
  type VasWorksheet {
    worksheet: worksheetInfo
    worksheetDetails: [WorksheetDetail]
  }
`;
//# sourceMappingURL=vas-worksheet.js.map