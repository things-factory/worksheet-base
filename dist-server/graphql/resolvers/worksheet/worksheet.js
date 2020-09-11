"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const biz_base_1 = require("@things-factory/biz-base");
const sales_base_1 = require("@things-factory/sales-base");
const typeorm_1 = require("typeorm");
const entities_1 = require("../../../entities");
exports.worksheetResolver = {
    async worksheet(_, { name }, context) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const worksheet = (await typeorm_1.getRepository(entities_1.Worksheet).findOne({
            where: {
                domain: context.state.domain,
                bizplace: typeorm_1.In(await biz_base_1.getPermittedBizplaceIds(context.state.domain, context.state.user)),
                name
            },
            relations: [
                'domain',
                'bizplace',
                'bufferLocation',
                'bufferLocation.warehouse',
                'arrivalNotice',
                'arrivalNotice.releaseGood',
                'releaseGood',
                'releaseGood.arrivalNotice',
                'inventoryCheck',
                'vasOrder',
                'worksheetDetails',
                'worksheetDetails.toLocation',
                'worksheetDetails.targetProduct',
                'worksheetDetails.targetProduct.product',
                'worksheetDetails.targetVas',
                'worksheetDetails.targetVas.vas',
                'worksheetDetails.targetVas.inventory',
                'worksheetDetails.targetVas.inventory.location',
                'worksheetDetails.targetVas.targetProduct',
                'worksheetDetails.targetInventory',
                'worksheetDetails.targetInventory.product',
                'worksheetDetails.targetInventory.inventory',
                'worksheetDetails.targetInventory.inventory.product',
                'worksheetDetails.targetInventory.inventory.warehouse',
                'worksheetDetails.targetInventory.inventory.location',
                'worksheetDetails.targetInventory.inspectedLocation',
                'creator',
                'updater'
            ]
        }));
        if ((_b = (_a = worksheet) === null || _a === void 0 ? void 0 : _a.arrivalNotice) === null || _b === void 0 ? void 0 : _b.id) {
            worksheet.orderProducts = await typeorm_1.getRepository(sales_base_1.OrderProduct).find({
                where: {
                    domain: context.state.domain,
                    bizplace: worksheet.bizplace,
                    arrivalNotice: worksheet.arrivalNotice
                }
            });
            worksheet.orderVass = await typeorm_1.getRepository(sales_base_1.OrderVas).find({
                where: {
                    domain: context.state.domain,
                    bizplace: worksheet.bizplace,
                    arrivalNotice: worksheet.arrivalNotice
                },
                relations: ['targetProduct']
            });
        }
        if ((_d = (_c = worksheet) === null || _c === void 0 ? void 0 : _c.releaseGood) === null || _d === void 0 ? void 0 : _d.id) {
            worksheet.orderInventories = await typeorm_1.getRepository(sales_base_1.OrderInventory).find({
                where: {
                    domain: context.state.domain,
                    bizplace: worksheet.bizplace,
                    releaseGood: worksheet.releaseGood
                },
                relations: ['product', 'inventory', 'inventory.location']
            });
            worksheet.orderVass = await typeorm_1.getRepository(sales_base_1.OrderVas).find({
                where: {
                    domain: context.state.domain,
                    bizplace: worksheet.bizplace,
                    releaseGood: worksheet.releaseGood
                },
                relations: ['targetProduct']
            });
        }
        if ((_f = (_e = worksheet) === null || _e === void 0 ? void 0 : _e.inventoryCheck) === null || _f === void 0 ? void 0 : _f.id) {
            worksheet.orderInventories = await typeorm_1.getRepository(sales_base_1.OrderInventory).find({
                where: {
                    domain: context.state.domain,
                    bizplace: worksheet.bizplace,
                    inventoryCheck: worksheet.inventoryCheck
                },
                relations: ['product', 'inventory', 'inventory.location']
            });
        }
        if ((_h = (_g = worksheet) === null || _g === void 0 ? void 0 : _g.vasOrder) === null || _h === void 0 ? void 0 : _h.id) {
            worksheet.orderVass = await typeorm_1.getRepository(sales_base_1.OrderVas).find({
                where: {
                    domain: context.state.domain,
                    bizplace: worksheet.bizplace,
                    vasOrder: worksheet.vasOrder
                },
                relations: ['targetProduct']
            });
        }
        return worksheet;
    }
};
//# sourceMappingURL=worksheet.js.map