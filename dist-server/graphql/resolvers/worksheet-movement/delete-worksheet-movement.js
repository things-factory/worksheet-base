"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const typeorm_1 = require("typeorm");
const entities_1 = require("../../../entities");
exports.deleteWorksheetMovement = {
    async deleteWorksheetMovement(_, { id }) {
        const repository = typeorm_1.getRepository(entities_1.WorksheetMovement);
        return await repository.delete(id);
    }
};
//# sourceMappingURL=delete-worksheet-movement.js.map