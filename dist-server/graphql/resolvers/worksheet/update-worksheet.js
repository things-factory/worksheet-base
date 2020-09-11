"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const biz_base_1 = require("@things-factory/biz-base");
const typeorm_1 = require("typeorm");
const entities_1 = require("../../../entities");
exports.updateWorksheet = {
    async updateWorksheet(_, { id, patch }, context) {
        const worksheet = await typeorm_1.getRepository(entities_1.Worksheet).findOne({
            where: {
                domain: context.state.domain,
                bizplace: typeorm_1.In(await biz_base_1.getPermittedBizplaceIds(context.state.domain, context.state.user)),
                id
            }
        });
        return await typeorm_1.getRepository(entities_1.Worksheet).save(Object.assign(Object.assign(Object.assign({}, worksheet), patch), { updater: context.state.user }));
    }
};
//# sourceMappingURL=update-worksheet.js.map