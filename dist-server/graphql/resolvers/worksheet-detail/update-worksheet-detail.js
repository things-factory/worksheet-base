"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const biz_base_1 = require("@things-factory/biz-base");
const sales_base_1 = require("@things-factory/sales-base");
const typeorm_1 = require("typeorm");
const entities_1 = require("../../../entities");
exports.updateWorksheetDetail = {
    async updateWorksheetDetail(_, { id, patch }, context) {
        const worksheetDetail = await typeorm_1.getRepository(entities_1.WorksheetDetail).findOne({
            where: {
                domain: context.state.domain,
                bizplace: typeorm_1.In(await biz_base_1.getPermittedBizplaceIds(context.state.domain, context.state.user)),
                id
            }
        });
        if (patch.worker && patch.worker.id) {
            patch.worker = await typeorm_1.getRepository(biz_base_1.Worker).findOne(patch.worker.id);
        }
        if (patch.targetProduct && patch.targetProduct.id) {
            patch.targetProduct = await typeorm_1.getRepository(sales_base_1.OrderProduct).findOne(patch.targetProduct.id);
        }
        if (patch.targetVas && patch.targetVas.id) {
            patch.targetVas = await typeorm_1.getRepository(sales_base_1.OrderVas).findOne(patch.targetVas.id);
        }
        return await typeorm_1.getRepository(entities_1.WorksheetDetail).save(Object.assign(Object.assign({}, worksheetDetail), { patch, updater: context.state.updater }));
    }
};
//# sourceMappingURL=update-worksheet-detail.js.map