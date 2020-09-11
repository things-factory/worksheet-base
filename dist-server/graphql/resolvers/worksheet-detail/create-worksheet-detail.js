"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const biz_base_1 = require("@things-factory/biz-base");
const sales_base_1 = require("@things-factory/sales-base");
const typeorm_1 = require("typeorm");
const entities_1 = require("../../../entities");
exports.createWorksheetDetail = {
    async createWorksheetDetail(_, { worksheetDetail }, context) {
        worksheetDetail.worksheet = await typeorm_1.getRepository(entities_1.Worksheet).findOne({
            where: {
                domain: context.state.domain,
                bizplace: await biz_base_1.getPermittedBizplaceIds(context.state.domain, context.state.user),
                id: worksheetDetail.worksheet.id
            }
        });
        if (worksheetDetail.worker && worksheetDetail.worker.id) {
            worksheetDetail.worker = await typeorm_1.getRepository(biz_base_1.Worker).findOne(worksheetDetail.worker.id);
        }
        if (worksheetDetail.targetProduct && worksheetDetail.targetProduct.id) {
            worksheetDetail.targetProduct = await typeorm_1.getRepository(sales_base_1.OrderProduct).findOne(worksheetDetail.targetProduct.id);
        }
        if (worksheetDetail.targetVas && worksheetDetail.targetVas.id) {
            worksheetDetail.targetVas = await typeorm_1.getRepository(sales_base_1.OrderVas).findOne(worksheetDetail.targetVas.id);
        }
        return await typeorm_1.getRepository(entities_1.WorksheetDetail).save(Object.assign(Object.assign({}, worksheetDetail), { domain: context.state.domain, bizplace: context.state.bizplace[0], creator: context.state.user, updater: context.state.user }));
    }
};
//# sourceMappingURL=create-worksheet-detail.js.map