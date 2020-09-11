"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const biz_base_1 = require("@things-factory/biz-base");
const shell_1 = require("@things-factory/shell");
const typeorm_1 = require("typeorm");
const entities_1 = require("../../../entities");
exports.worksheetDetailsResolver = {
    async worksheetDetails(_, params, context) {
        const convertedParams = shell_1.convertListParams(params);
        convertedParams.where.bizplace = typeorm_1.In(await biz_base_1.getPermittedBizplaceIds(context.state.domain, context.state.user));
        const [items, total] = await typeorm_1.getRepository(entities_1.WorksheetDetail).findAndCount(Object.assign(Object.assign({}, convertedParams), { relations: ['domain', 'bizplace', 'worksheet', 'worker', 'targetProduct', 'targetVas', 'creator', 'updater'] }));
        return { items, total };
    }
};
//# sourceMappingURL=worksheet-details.js.map