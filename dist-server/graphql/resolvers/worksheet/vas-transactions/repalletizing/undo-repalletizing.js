"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const typeorm_1 = require("typeorm");
const common_utils_1 = require("../common-utils");
exports.undoRepalletizingResolver = {
    async undoRepalletizing(_, { worksheetDetailName, fromPalletId, toPalletId }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            var _a;
            /**
             * Initialize required variables
             */
            const domain = context.state.domain;
            const user = context.state.user;
            const wsd = await common_utils_1.getWorksheetDetailByName(trxMgr, domain, worksheetDetailName);
            const bizplace = wsd.bizplace;
            const targetVas = wsd.targetVas;
            const { arrivalNotice, releaseGood, vasOrder } = targetVas;
            const refOrder = arrivalNotice || releaseGood || vasOrder;
            let operationGuide = JSON.parse(targetVas.operationGuide);
            let operationGuideData = operationGuide.data;
            let repalletizedInvs = operationGuideData.repalletizedInvs;
            let undoInventory = repalletizedInvs.find((ri) => ri.palletId === toPalletId);
            if (!undoInventory)
                throw new Error(`Couldn't find pallet, using pallet id (${toPalletId})`);
            const stdQty = operationGuideData.stdQty;
            // If current undo pallet is completed pallet, plus 1 required pallet qty
            const totalQty = undoInventory.repalletizedFrom.reduce((totalQty, rf) => (totalQty += rf.reducedQty), 0);
            if (totalQty === stdQty) {
                operationGuideData.requiredPalletQty++;
            }
            undoInventory.repalletizedFrom = undoInventory.repalletizedFrom.filter((rf) => rf.fromPalletId !== fromPalletId);
            let updatedRepalletizedInvs;
            if (!((_a = undoInventory.repalletizedFrom) === null || _a === void 0 ? void 0 : _a.length)) {
                updatedRepalletizedInvs = repalletizedInvs.filter((ri) => ri.palletId !== toPalletId);
            }
            else {
                updatedRepalletizedInvs = repalletizedInvs.map((ri) => {
                    if (ri.palletId === toPalletId) {
                        ri = undoInventory;
                    }
                    return ri;
                });
            }
            operationGuide.data.repalletizedInvs = updatedRepalletizedInvs;
            if (!(refOrder instanceof sales_base_1.VasOrder)) {
                const palletChanges = operationGuide.data.repalletizedInvs
                    .map((ri) => ri.repalletizedFrom)
                    .flat();
                await common_utils_1.dismissInventory(trxMgr, wsd, targetVas, palletChanges, toPalletId);
            }
            // Update every order vas to share same operation guide
            await common_utils_1.updateRelatedOrderVas(trxMgr, domain, bizplace, wsd, targetVas, operationGuide, user);
        });
    }
};
//# sourceMappingURL=undo-repalletizing.js.map