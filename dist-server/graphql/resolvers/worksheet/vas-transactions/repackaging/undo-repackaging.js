"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const typeorm_1 = require("typeorm");
const entities_1 = require("../../../../../entities");
const common_utils_1 = require("../common-utils");
const interfaces_1 = require("../interfaces");
exports.undoRepackagingResolver = {
    async undoRepackaging(_, { worksheetDetailName, fromPalletId, toPalletId }, context) {
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
            let repackedInvs = operationGuideData.repackedInvs;
            let undoInventory = repackedInvs.find((ri) => ri.palletId === toPalletId);
            if (!undoInventory)
                throw new Error(`Couldn't find pallet, using pallet id (${toPalletId})`);
            const packingUnit = operationGuideData.packingUnit;
            const stdAmount = operationGuideData.stdAmount;
            undoInventory.repackedFrom = undoInventory.repackedFrom.filter((rf) => rf.fromPalletId !== fromPalletId);
            // 완전히 Repacked 상태인 pallet count
            const repackedPkgQty = undoInventory.repackedFrom.reduce((totalAmount, rf) => {
                const amount = packingUnit === interfaces_1.PackingUnits.QTY ? rf.reducedQty : rf.reducedWeight;
                totalAmount += amount;
                return totalAmount;
            }, 0) / stdAmount;
            // Undo를 발생한 수량 차이를 계산
            undoInventory.repackedPkgQty = repackedPkgQty;
            // Pallet 전체가 취소된 경우
            let updatedRepackedInvs;
            if (!((_a = undoInventory.repackedFrom) === null || _a === void 0 ? void 0 : _a.length)) {
                updatedRepackedInvs = repackedInvs.filter((ri) => ri.palletId !== toPalletId);
            }
            else {
                updatedRepackedInvs = repackedInvs.map((ri) => {
                    if (ri.palletId === toPalletId)
                        ri = undoInventory;
                    return ri;
                });
            }
            const requiredPackageQty = await getRequiredPackageQty(trxMgr, domain, bizplace, wsd.worksheet, targetVas, packingUnit, stdAmount);
            const repackedPackageQty = getRepackedPackageQty(updatedRepackedInvs);
            operationGuide.data.requiredPackageQty = requiredPackageQty - repackedPackageQty;
            operationGuide.data.repackedInvs = updatedRepackedInvs;
            if (!(refOrder instanceof sales_base_1.VasOrder)) {
                const palletChanges = operationGuide.data.repackedInvs
                    .map((ri) => ri.repackedFrom)
                    .flat();
                await common_utils_1.dismissInventory(trxMgr, wsd, targetVas, palletChanges, fromPalletId);
            }
            // Update every order vas to share same operation guide
            await common_utils_1.updateRelatedOrderVas(trxMgr, domain, bizplace, wsd, targetVas, operationGuide, user);
        });
    }
};
function getRepackedPackageQty(repackedInvs) {
    return repackedInvs.reduce((repackedPkgQty, ri) => (repackedPkgQty += ri.repackedPkgQty), 0);
}
/**
 * @description Get total required package qty to complete this Repackagine VAS Task.
 *
 * @param {EntityManager} trxMgr
 * @param {Domain} domain
 * @param {Bizplace} bizplace
 * @param {Worksheet} worksheet
 * @param {String} packingUnit
 * @param {Number} stdAmount
 */
async function getRequiredPackageQty(trxMgr, domain, bizplace, worksheet, currentOV, packingUnit, stdAmount) {
    const relatedWSDs = await trxMgr.getRepository(entities_1.WorksheetDetail).find({
        where: { domain, bizplace, worksheet },
        relations: ['targetVas', 'targetVas.vas']
    });
    const orderVASs = relatedWSDs.map((wsd) => wsd.targetVas);
    const { qty, weight } = orderVASs
        .filter((ov) => ov.set === currentOV.set && ov.vas.id === currentOV.vas.id)
        .reduce((total, ov) => {
        total.qty += ov.qty;
        total.weight += ov.weight;
        return total;
    }, { qty: 0, weight: 0 });
    if (packingUnit === interfaces_1.PackingUnits.QTY) {
        return qty / stdAmount;
    }
    else if (packingUnit === interfaces_1.PackingUnits.WEIGHT) {
        return weight / stdAmount;
    }
}
//# sourceMappingURL=undo-repackaging.js.map