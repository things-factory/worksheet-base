"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const apollo_server_koa_1 = require("apollo-server-koa");
exports.NewWorksheet = apollo_server_koa_1.gql `
  input NewWorksheet {
    name: String
    description: String
    type: String!
    worksheetDetails: [ObjectRef]
  }
`;
//# sourceMappingURL=new-worksheet.js.map