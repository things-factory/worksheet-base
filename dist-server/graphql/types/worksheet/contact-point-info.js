"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const apollo_server_koa_1 = require("apollo-server-koa");
exports.ContactPointInfo = apollo_server_koa_1.gql `
  type ContactPointInfo {
    id: String
    address: String
    email: String
    fax: String
    phone: String
    contactName: String
  }
`;
//# sourceMappingURL=contact-point-info.js.map