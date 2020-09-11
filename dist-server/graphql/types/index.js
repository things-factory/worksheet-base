"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const shell_1 = require("@things-factory/shell");
const Worksheet = __importStar(require("./worksheet"));
const WorksheetDetail = __importStar(require("./worksheet-detail"));
const WorksheetMovement = __importStar(require("./worksheet-movement"));
exports.queries = [Worksheet.Query, WorksheetDetail.Query, WorksheetMovement.Query];
exports.mutations = [Worksheet.Mutation, WorksheetDetail.Mutation, WorksheetMovement.Mutation];
exports.types = [
    shell_1.Filter,
    shell_1.Sorting,
    shell_1.Pagination,
    shell_1.ObjectRef,
    ...Worksheet.Types,
    ...WorksheetDetail.Types,
    ...WorksheetMovement.Types
];
//# sourceMappingURL=index.js.map