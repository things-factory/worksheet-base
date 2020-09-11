"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const typeorm_1 = require("typeorm");
const entities_1 = require("../../../entities");
exports.updateWorksheetMovement = {
    async updateWorksheetMovement(_, { id, patch }) {
        const repository = typeorm_1.getRepository(entities_1.WorksheetMovement);
        const worksheetMovement = await repository.findOne({ id });
        return await repository.save(Object.assign(Object.assign({}, worksheetMovement), patch));
    }
};
//# sourceMappingURL=update-worksheet-movement.js.map