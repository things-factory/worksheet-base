"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const typeorm_1 = require("typeorm");
const entities_1 = require("../../../entities");
exports.worksheetMovementResolver = {
    async worksheetMovement(_, { id }, context, info) {
        const repository = typeorm_1.getRepository(entities_1.WorksheetMovement);
        return await repository.findOne({ id });
    }
};
//# sourceMappingURL=worksheet-movement.js.map