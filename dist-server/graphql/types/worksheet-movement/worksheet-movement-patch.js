"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const apollo_server_koa_1 = require("apollo-server-koa");
exports.WorksheetMovementPatch = apollo_server_koa_1.gql `
  input WorksheetMovementPatch {
    name: String
    description: String
  }
`;
//# sourceMappingURL=worksheet-movement-patch.js.map