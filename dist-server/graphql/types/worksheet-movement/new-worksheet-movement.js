"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const apollo_server_koa_1 = require("apollo-server-koa");
exports.NewWorksheetMovement = apollo_server_koa_1.gql `
  input NewWorksheetMovement {
    name: String!
    description: String
  }
`;
//# sourceMappingURL=new-worksheet-movement.js.map