"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const shell_1 = require("@things-factory/shell");
const typeorm_1 = require("typeorm");
const entities_1 = require("../../../entities");
exports.worksheetMovementsResolver = {
    async worksheetMovements(_, params, context) {
        const queryBuilder = typeorm_1.getRepository(entities_1.WorksheetMovement).createQueryBuilder();
        shell_1.buildQuery(queryBuilder, params);
        const [items, total] = await queryBuilder.getManyAndCount();
        return { items, total };
    }
};
//# sourceMappingURL=worksheet-movements.js.map