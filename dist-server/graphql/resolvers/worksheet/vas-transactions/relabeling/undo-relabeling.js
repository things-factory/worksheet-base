"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const typeorm_1 = require("typeorm");
const common_utils_1 = require("../common-utils");
exports.undoRelabelingResolver = {
    async undoRelabeling(_, { worksheetDetailName, toPalletId }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            /** Initialize required variables */
            const { domain, user } = context.state;
            const wsd = await common_utils_1.getWorksheetDetailByName(trxMgr, domain, worksheetDetailName);
            const { bizplace, targetVas } = wsd;
            if (!targetVas)
                throw new Error(`Couldn't find any related target vas, using current worksheet detail`);
            const { arrivalNotice, releaseGood, vasOrder } = targetVas;
            const refOrder = arrivalNotice || releaseGood || vasOrder;
            let operationGuide = JSON.parse(targetVas.operationGuide);
            let operationGuideData = operationGuide.data;
            const fromPalletId = targetVas.inventory.palletId;
            // Filter out pallets which has same id with undoPalletId
            operationGuide.data.relabeledFrom = operationGuideData.relabeledFrom.filter((pc) => pc.fromPalletId !== fromPalletId || (pc.fromPalletId === fromPalletId && pc.toPalletId !== toPalletId));
            if (!(refOrder instanceof sales_base_1.VasOrder)) {
                await common_utils_1.dismissInventory(trxMgr, wsd, targetVas, operationGuide.data.relabeledFrom, fromPalletId);
            }
            // Update every related operation guide to share same data
            await common_utils_1.updateRelatedOrderVas(trxMgr, domain, bizplace, wsd, targetVas, operationGuide, user);
        });
    }
};
//# sourceMappingURL=undo-relabeling.js.map