"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const Worksheet = __importStar(require("./worksheet"));
const WorksheetDetail = __importStar(require("./worksheet-detail"));
const WorksheetMovement = __importStar(require("./worksheet-movement"));
const Pallet = __importStar(require("./pallet"));
exports.queries = [Worksheet.Query, WorksheetDetail.Query, WorksheetMovement.Query];
exports.mutations = [Worksheet.Mutation, WorksheetDetail.Mutation, WorksheetMovement.Mutation, Pallet.Mutation];
//# sourceMappingURL=index.js.map