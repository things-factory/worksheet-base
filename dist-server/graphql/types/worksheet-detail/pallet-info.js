"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const graphql_tag_1 = __importDefault(require("graphql-tag"));
exports.PalletInfo = graphql_tag_1.default `
  input PalletInfo {
    id: String
    printQty: Int
  }
`;
//# sourceMappingURL=pallet-info.js.map