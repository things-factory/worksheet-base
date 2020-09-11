"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const v4_1 = __importDefault(require("uuid/v4"));
class WorksheetNoGenerator {
    static unloading() {
        return `ULD-${v4_1.default()}`;
    }
    static putaway() {
        return `PUTAWAY-${v4_1.default()}`;
    }
    static loading() {
        return `LOAD-${v4_1.default()}`;
    }
    static return() {
        return `RETURN-${v4_1.default()}`;
    }
    static cycleCount() {
        return `CC-${v4_1.default()}`;
    }
    static stockTake() {
        return `ST-${v4_1.default()}`;
    }
    static picking() {
        return `PICK-${v4_1.default()}`;
    }
    static vas() {
        return `VAS-${v4_1.default()}`;
    }
    static unloadingDetail() {
        return `ULD-DETAIL-${v4_1.default()}`;
    }
    static putawayDetail() {
        return `PUTAWAY-DETAIL-${v4_1.default()}`;
    }
    static cycleCountDetail() {
        return `CC-DETAIL-${v4_1.default()}`;
    }
    static stockTakeDetail() {
        return `ST-DETAIL-${v4_1.default()}`;
    }
    static loadingDetail() {
        return `LOAD-DETAIL-${v4_1.default()}`;
    }
    static returnDetail() {
        return `RETURN-DETAIL-${v4_1.default()}`;
    }
    static pickingDetail() {
        return `PICK-DETAIL-${v4_1.default()}`;
    }
    static vasDetail() {
        return `VAS-DETAIL-${v4_1.default()}`;
    }
}
exports.WorksheetNoGenerator = WorksheetNoGenerator;
//# sourceMappingURL=worksheet-no-generator.js.map