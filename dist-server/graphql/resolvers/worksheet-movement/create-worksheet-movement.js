"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const v4_1 = __importDefault(require("uuid/v4"));
const typeorm_1 = require("typeorm");
const entities_1 = require("../../../entities");
exports.createWorksheetMovement = {
    async createWorksheetMovement(_, { worksheetMovement: attrs }) {
        const repository = typeorm_1.getRepository(entities_1.WorksheetMovement);
        const newWorksheetMovement = Object.assign({ id: v4_1.default() }, attrs);
        return await repository.save(newWorksheetMovement);
    }
};
//# sourceMappingURL=create-worksheet-movement.js.map