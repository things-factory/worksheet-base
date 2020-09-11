"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const typeorm_1 = require("typeorm");
const entities_1 = require("../../../entities");
exports.createWorksheet = {
    async createWorksheet(_, { worksheet }, context) {
        return await typeorm_1.getRepository(entities_1.Worksheet).save(Object.assign(Object.assign({}, worksheet), { domain: context.state.domain, bizplace: context.state.bizplace[0], creator: context.state.user, updater: context.state.user }));
    }
};
//# sourceMappingURL=create-worksheet.js.map