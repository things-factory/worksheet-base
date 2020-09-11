"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
const utils_1 = require("../../../utils");
exports.loadingWorksheetResolver = {
    async loadingWorksheet(_, { releaseGoodNo }, context) {
        const releaseGood = await typeorm_1.getRepository(sales_base_1.ReleaseGood).findOne({
            where: { domain: context.state.domain, name: releaseGoodNo /*status: ORDER_STATUS.LOADING*/ },
            relations: ['bizplace']
        });
        if (!releaseGood)
            throw new Error(`Release good doesn't exists.`);
        const foundWorksheet = await utils_1.fetchExecutingWorksheet(context.state.domain, releaseGood.bizplace, ['bizplace', 'worksheetDetails'], constants_1.WORKSHEET_TYPE.LOADING, releaseGood);
        const foundWSD = await typeorm_1.getRepository(entities_1.WorksheetDetail).find({
            where: {
                domain: context.state.domain,
                worksheet: foundWorksheet,
                type: constants_1.WORKSHEET_TYPE.LOADING,
                status: typeorm_1.Not(typeorm_1.Equal(constants_1.WORKSHEET_STATUS.DONE))
            },
            relations: [
                'targetInventory',
                'targetInventory.inventory',
                'targetInventory.inventory.location',
                'targetInventory.inventory.product'
            ]
        });
        return {
            worksheetInfo: {
                bizplaceName: releaseGood.bizplace.name,
                startedAt: foundWorksheet.startedAt,
                refNo: releaseGood.refNo,
                ownCollection: releaseGood.ownTransport
            },
            worksheetDetailInfos: foundWSD.map(async (loadingWSD) => {
                const targetInventory = loadingWSD.targetInventory;
                const inventory = targetInventory.inventory;
                return {
                    name: loadingWSD.name,
                    palletId: inventory.palletId,
                    batchId: inventory.batchId,
                    product: inventory.product,
                    releaseQty: targetInventory.releaseQty,
                    releaseWeight: targetInventory.releaseWeight,
                    status: loadingWSD.status,
                    description: loadingWSD.description,
                    targetName: targetInventory.name,
                    packingType: inventory.packingType,
                    inventory: targetInventory.inventory
                };
            })
        };
    }
};
//# sourceMappingURL=loading-worksheet.js.map