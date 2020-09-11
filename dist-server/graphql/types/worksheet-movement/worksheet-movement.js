"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const apollo_server_koa_1 = require("apollo-server-koa");
exports.WorksheetMovement = apollo_server_koa_1.gql `
  type WorksheetMovement {
    id: String
    name: String
    domain: Domain
    description: String
  }
`;
//# sourceMappingURL=worksheet-movement.js.map