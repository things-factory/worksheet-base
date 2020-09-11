"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const apollo_server_koa_1 = require("apollo-server-koa");
exports.InventoryCheckWorksheet = apollo_server_koa_1.gql `
  type InventoryCheckWorksheet {
    cycleCountWorksheet: Worksheet
  }
`;
//# sourceMappingURL=inventory-check-worksheet.js.map