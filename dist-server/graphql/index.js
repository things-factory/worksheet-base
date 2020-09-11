"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const typeDefs = __importStar(require("./types"));
const resolvers = __importStar(require("./resolvers"));
exports.schema = {
    typeDefs,
    resolvers
};
//# sourceMappingURL=index.js.map