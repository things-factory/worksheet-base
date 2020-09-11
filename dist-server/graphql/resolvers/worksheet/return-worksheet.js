"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const utils_1 = require("../../../utils");
exports.returnWorksheetResolver = {
    async returnWorksheet(_, { releaseGoodNo }, context) {
        const releaseGood = await typeorm_1.getRepository(sales_base_1.ReleaseGood).findOne({
            where: { domain: context.state.domain, name: releaseGoodNo /*status: ORDER_STATUS.PARTIAL_RETURN*/ },
            relations: ['bizplace']
        });
        if (!releaseGood)
            throw new Error(`Release good dosen't exist.`);
        const worksheet = await utils_1.fetchExecutingWorksheet(context.state.domain, releaseGood.bizplace, [
            'bizplace',
            'worksheetDetails',
            'worksheetDetails.targetInventory',
            'worksheetDetails.targetInventory.inventory',
            'worksheetDetails.targetInventory.inventory.location',
            'worksheetDetails.targetInventory.inventory.product'
        ], constants_1.WORKSHEET_TYPE.RETURN, releaseGood);
        return {
            worksheetInfo: {
                bizplaceName: releaseGood.bizplace.name,
                refNo: releaseGood.refNo,
                startedAt: worksheet.startedAt
            },
            worksheetDetailInfos: worksheet.worksheetDetails.map(async (returnWSD) => {
                const targetInventory = returnWSD.targetInventory;
                const inventory = targetInventory.inventory;
                return {
                    name: returnWSD.name,
                    palletId: inventory.palletId,
                    batchId: inventory.batchId,
                    product: inventory.product,
                    qty: targetInventory.releaseQty,
                    status: returnWSD.status,
                    description: returnWSD.description,
                    targetName: targetInventory.name,
                    packingType: inventory.packingType,
                    location: inventory.location
                };
            })
        };
    }
};
//# sourceMappingURL=return-worksheet.js.map