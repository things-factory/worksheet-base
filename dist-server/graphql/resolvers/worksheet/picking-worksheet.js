"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
const utils_1 = require("../../../utils");
exports.pickingWorksheetResolver = {
    async pickingWorksheet(_, { releaseGoodNo, locationSortingRules }, context) {
        var _a;
        const releaseGood = await typeorm_1.getRepository(sales_base_1.ReleaseGood).findOne({
            where: { domain: context.state.domain, name: releaseGoodNo /*status: ORDER_STATUS.PICKING*/ },
            relations: ['bizplace']
        });
        if (!releaseGood)
            throw new Error(`Couldn't find picking worksheet by order no (${releaseGoodNo})`);
        const worksheet = await utils_1.fetchExecutingWorksheet(context.state.domain, releaseGood.bizplace, ['bizplace'], constants_1.WORKSHEET_TYPE.PICKING, releaseGood);
        const qb = typeorm_1.createQueryBuilder(entities_1.WorksheetDetail, 'WSD');
        qb.leftJoinAndSelect('WSD.targetInventory', 'T_INV')
            .leftJoinAndSelect('T_INV.inventory', 'INV')
            .leftJoinAndSelect('T_INV.product', 'PROD')
            .leftJoinAndSelect('INV.location', 'LOC');
        if (((_a = locationSortingRules) === null || _a === void 0 ? void 0 : _a.length) > 0) {
            locationSortingRules.forEach((rule) => {
                qb.addOrderBy(`LOC.${rule.name}`, rule.desc ? 'DESC' : 'ASC');
            });
        }
        const worksheetDetails = await qb
            .where('"WSD"."worksheet_id" = :worksheetId', { worksheetId: worksheet.id })
            .andWhere('"WSD"."status" != :status', { status: constants_1.WORKSHEET_STATUS.REPLACED })
            .getMany();
        return {
            worksheetInfo: {
                bizplaceName: releaseGood.bizplace.name,
                startedAt: worksheet.startedAt,
                refNo: releaseGood.refNo,
                releaseGood
            },
            worksheetDetailInfos: worksheetDetails.map(async (pickingWSD) => {
                var _a, _b, _c, _d, _e, _f;
                const targetInventory = pickingWSD.targetInventory;
                const inventory = targetInventory.inventory;
                return {
                    name: pickingWSD.name,
                    palletId: (_a = inventory) === null || _a === void 0 ? void 0 : _a.palletId,
                    batchId: (_b = inventory) === null || _b === void 0 ? void 0 : _b.batchId,
                    product: (_c = inventory) === null || _c === void 0 ? void 0 : _c.product,
                    qty: (_d = inventory) === null || _d === void 0 ? void 0 : _d.qty,
                    releaseQty: targetInventory.releaseQty,
                    status: pickingWSD.status,
                    description: pickingWSD.description,
                    targetName: targetInventory.name,
                    packingType: (_e = inventory) === null || _e === void 0 ? void 0 : _e.packingType,
                    location: (_f = inventory) === null || _f === void 0 ? void 0 : _f.location,
                    relatedOrderInv: targetInventory
                };
            })
        };
    }
};
//# sourceMappingURL=picking-worksheet.js.map