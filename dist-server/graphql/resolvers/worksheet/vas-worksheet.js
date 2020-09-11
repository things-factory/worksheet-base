"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const utils_1 = require("../../../utils");
exports.vasWorksheetResolver = {
    async vasWorksheet(_, { orderNo, orderType }, context) {
        var _a;
        let refOrder;
        if (orderType === sales_base_1.ORDER_TYPES.ARRIVAL_NOTICE) {
            refOrder = await typeorm_1.getRepository(sales_base_1.ArrivalNotice).findOne({
                where: { domain: context.state.domain, name: orderNo, status: typeorm_1.Not(typeorm_1.Equal(sales_base_1.ORDER_STATUS.DONE)) },
                relations: ['bizplace']
            });
        }
        else if (orderType === sales_base_1.ORDER_TYPES.RELEASE_OF_GOODS) {
            refOrder = await typeorm_1.getRepository(sales_base_1.ReleaseGood).findOne({
                where: { domain: context.state.domain, name: orderNo, status: typeorm_1.Not(typeorm_1.Equal(sales_base_1.ORDER_STATUS.DONE)) },
                relations: ['bizplace']
            });
        }
        else if (orderType === sales_base_1.ORDER_TYPES.VAS_ORDER) {
            refOrder = await typeorm_1.getRepository(sales_base_1.VasOrder).findOne({
                where: { domain: context.state.domain, name: orderNo, status: typeorm_1.Not(typeorm_1.Equal(sales_base_1.ORDER_STATUS.DONE)) },
                relations: ['bizplace']
            });
        }
        if (!refOrder)
            throw new Error(`Couldn't find VAS worksheet by order no (${orderNo})`);
        const worksheet = await utils_1.fetchExecutingWorksheet(context.state.domain, refOrder.bizplace, [
            'worksheetDetails',
            'worksheetDetails.targetVas',
            'worksheetDetails.targetVas.vas',
            'worksheetDetails.targetVas.inventory',
            'worksheetDetails.targetVas.targetProduct',
            'worksheetDetails.targetVas.inventory.location',
            'creator',
            'updater'
        ], constants_1.WORKSHEET_TYPE.VAS, refOrder);
        if (orderType === sales_base_1.ORDER_TYPES.RELEASE_OF_GOODS) {
            for (let wsd of worksheet.worksheetDetails) {
                const inventory = wsd.targetVas.inventory;
                const orderInv = await typeorm_1.getRepository(sales_base_1.OrderInventory).findOne({
                    where: { domain: context.state.domain, releaseGood: refOrder, inventory }
                });
                wsd.targetInventory = orderInv;
            }
        }
        return {
            worksheetInfo: {
                bizplaceName: refOrder.bizplace.name,
                containerNo: (_a = refOrder) === null || _a === void 0 ? void 0 : _a.containerNo,
                startedAt: worksheet.startedAt
            },
            worksheetDetailInfos: worksheet.worksheetDetails
                .sort((a, b) => a.seq - b.seq)
                .map((wsd) => {
                var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
                const targetVas = wsd.targetVas;
                return {
                    name: wsd.name,
                    seq: wsd.seq,
                    status: wsd.status,
                    issue: wsd.issue,
                    relatedOrderInv: wsd.targetInventory,
                    batchId: (_a = targetVas) === null || _a === void 0 ? void 0 : _a.batchId,
                    targetName: (_b = targetVas) === null || _b === void 0 ? void 0 : _b.name,
                    vas: (_c = targetVas) === null || _c === void 0 ? void 0 : _c.vas,
                    set: (_d = targetVas) === null || _d === void 0 ? void 0 : _d.set,
                    inventory: (_e = targetVas) === null || _e === void 0 ? void 0 : _e.inventory,
                    locationInv: (_h = (_g = (_f = targetVas) === null || _f === void 0 ? void 0 : _f.inventory) === null || _g === void 0 ? void 0 : _g.location) === null || _h === void 0 ? void 0 : _h.name,
                    targetType: (_j = targetVas) === null || _j === void 0 ? void 0 : _j.targetType,
                    targetBatchId: (_k = targetVas) === null || _k === void 0 ? void 0 : _k.targetBatchId,
                    targetProduct: (_l = targetVas) === null || _l === void 0 ? void 0 : _l.targetProduct,
                    otherTarget: (_m = targetVas) === null || _m === void 0 ? void 0 : _m.otherTarget,
                    qty: (_o = targetVas) === null || _o === void 0 ? void 0 : _o.qty,
                    weight: (_p = targetVas) === null || _p === void 0 ? void 0 : _p.weight,
                    operationGuide: (_q = targetVas) === null || _q === void 0 ? void 0 : _q.operationGuide,
                    description: wsd.description,
                    remark: (_r = targetVas) === null || _r === void 0 ? void 0 : _r.remark
                };
            })
        };
    }
};
//# sourceMappingURL=vas-worksheet.js.map