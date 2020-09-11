"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const utils_1 = require("../../../utils");
exports.putawayWorksheetResolver = {
    async putawayWorksheet(_, { arrivalNoticeNo }, context) {
        const arrivalNotice = await typeorm_1.getRepository(sales_base_1.ArrivalNotice).findOne({
            // Because of partial unloading current status of arrivalNotice can be PUTTING_AWAY or PROCESSING
            // PUTTING_AWAY means unloading is completely finished.
            // PROCESSING means some products are still being unloaded.
            where: {
                domain: context.state.domain,
                name: arrivalNoticeNo
                /*status: In([ORDER_STATUS.PUTTING_AWAY, ORDER_STATUS.PROCESSING])*/
            },
            relations: ['bizplace']
        });
        if (!arrivalNotice)
            throw new Error(`Arrival notice dosen't exist.`);
        const worksheet = await utils_1.fetchExecutingWorksheet(context.state.domain, arrivalNotice.bizplace, [
            'bizplace',
            'arrivalNotice',
            'worksheetDetails',
            'worksheetDetails.targetInventory',
            'worksheetDetails.targetInventory.inventory',
            'worksheetDetails.targetInventory.inventory.location',
            'worksheetDetails.targetInventory.inventory.product',
            'worksheetDetails.targetInventory.inventory.reusablePallet',
            'worksheetDetails.toLocation'
        ], constants_1.WORKSHEET_TYPE.PUTAWAY, arrivalNotice);
        return {
            worksheetInfo: {
                bizplaceName: arrivalNotice.bizplace.name,
                refNo: arrivalNotice.refNo,
                startedAt: worksheet.startedAt
            },
            worksheetDetailInfos: worksheet.worksheetDetails.map(async (putawayWSD) => {
                const targetInventory = putawayWSD.targetInventory;
                const inventory = targetInventory.inventory;
                return {
                    name: putawayWSD.name,
                    palletId: inventory.palletId,
                    batchId: inventory.batchId,
                    product: inventory.product,
                    qty: inventory.qty,
                    status: putawayWSD.status,
                    description: putawayWSD.description,
                    targetName: targetInventory.name,
                    packingType: inventory.packingType,
                    location: inventory.location,
                    reusablePallet: inventory.reusablePallet
                };
            })
        };
    }
};
//# sourceMappingURL=putaway-worksheet.js.map