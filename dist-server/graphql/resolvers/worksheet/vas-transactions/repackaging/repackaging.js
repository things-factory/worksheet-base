"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const warehouse_base_1 = require("@things-factory/warehouse-base");
const typeorm_1 = require("typeorm");
const entities_1 = require("../../../../../entities");
const utils_1 = require("../../../../../utils");
const execute_vas_1 = require("../../execute-vas");
const common_utils_1 = require("../common-utils");
const interfaces_1 = require("../interfaces");
exports.repackagingResolver = {
    async repackaging(_, { worksheetDetailName, fromPalletId, toPalletId, locationName, packageQty }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            const domain = context.state.domain;
            const user = context.state.user;
            const location = await trxMgr.getRepository(warehouse_base_1.Location).findOne({
                where: { domain, name: locationName },
                relations: ['warehouse']
            });
            if (!location)
                throw new Error(`Couldn't find location by its name (${locationName})`);
            const warehouse = location.warehouse;
            if (!warehouse)
                throw new Error(`Location (name: ${locationName}) doesn't have any relation with warehouse`);
            // Find target worksheet detail & target order vas & bizplace
            const wsd = await common_utils_1.getWorksheetDetailByName(trxMgr, domain, worksheetDetailName);
            let { bizplace, targetVas } = wsd;
            // Check whether from pallet has valid condition compared with customer's request
            // Batch ID, product and packing type
            const { identicallity, errorMessage } = await utils_1.checkPalletIdenticallity(domain, bizplace, fromPalletId, targetVas.targetBatchId, targetVas.targetProduct, targetVas.packingType, trxMgr);
            if (!identicallity)
                throw new Error(errorMessage);
            // Check whether there's duplicated inventory in warehouse.
            if (await utils_1.checkPalletDuplication(domain, bizplace, toPalletId, trxMgr))
                throw new Error(`The Pallet ID (${toPalletId}) is duplicated.`);
            // Init refOrder
            const { arrivalNotice, releaseGood, vasOrder } = targetVas;
            const refOrder = arrivalNotice || releaseGood || vasOrder || null;
            if (!refOrder)
                throw new Error(`Couldn't find reference order with current order vas`);
            // Assign inventory if specific inventory isn't assigned yet.
            // This case is occured when the VAS order comes with Arrival Notice or Release Good
            if (!targetVas.inventory) {
                targetVas = await common_utils_1.assignInventory(trxMgr, domain, bizplace, user, wsd, refOrder, targetVas, fromPalletId);
            }
            let originInv = targetVas.inventory;
            let operationGuide = JSON.parse(targetVas.operationGuide);
            let operationGuideData = operationGuide.data;
            if (!operationGuideData.repackedInvs)
                operationGuideData.repackedInvs = [];
            const palletChanges = operationGuideData.repackedInvs
                .map((ri) => ri.repackedFrom)
                .flat();
            const { remainQty, remainWeight } = await common_utils_1.getRemainInventoryAmount(trxMgr, refOrder, domain, bizplace, originInv, palletChanges, fromPalletId);
            const unitWeight = remainWeight / remainQty;
            const packingUnit = operationGuideData.packingUnit;
            const stdAmount = operationGuideData.stdAmount;
            let repackedInv = getRepackedInv(operationGuideData, toPalletId, locationName);
            let isCompleted = false; // Flag for calling executeVas function to change status of worksheet detail
            if (packingUnit === interfaces_1.PackingUnits.QTY) {
                const reducedQty = remainQty >= stdAmount * packageQty ? stdAmount * packageQty : remainQty;
                const repackedFrom = {
                    fromPalletId,
                    toPalletId,
                    reducedQty,
                    reducedWeight: reducedQty * unitWeight
                };
                repackedInv.repackedFrom.push(repackedFrom);
                const totalPackedQty = repackedInv.repackedFrom.reduce((qty, rf) => (qty += rf.reducedQty), 0);
                repackedInv.repackedPkgQty = totalPackedQty / stdAmount;
                isCompleted = remainQty <= stdAmount * packageQty;
            }
            else if (packingUnit === interfaces_1.PackingUnits.WEIGHT) {
                // Case 1. When batchProcess is true => Reduce as much as remainWeight to complete this repackaging task
                // Case 2. When from pallet has more products than std amount => Reduce as much as stdAmount
                // Case 3. When from pallet has less products than std amount => Reduce as much as remainWeight
                const reducedWeight = remainWeight >= stdAmount * packageQty ? stdAmount * packageQty : remainWeight;
                const repackedFrom = {
                    fromPalletId,
                    toPalletId,
                    reducedWeight,
                    reducedQty: reducedWeight / unitWeight
                };
                repackedInv.repackedFrom.push(repackedFrom);
                const totalPackedWeight = repackedInv.repackedFrom.reduce((weight, rf) => (weight += rf.reducedWeight), 0);
                repackedInv.repackedPkgQty = totalPackedWeight / stdAmount;
                isCompleted = remainWeight <= stdAmount * packageQty;
            }
            // Get total required package qty to complete this VAS Task
            const requiredPackageQty = await getRequiredPackageQty(trxMgr, domain, bizplace, wsd.worksheet, targetVas, packingUnit, stdAmount);
            // Get total repacked package qty until this transaction
            const repackedPackageQty = getRepackedPackageQty(operationGuideData.repackedInvs);
            const remainRequiredPackageQty = requiredPackageQty - repackedPackageQty;
            operationGuide.data.requiredPackageQty = remainRequiredPackageQty;
            operationGuide.data.repackedInvs = operationGuideData.repackedInvs;
            // Update every order vas to share same operation guide
            await common_utils_1.updateRelatedOrderVas(trxMgr, domain, bizplace, wsd, targetVas, operationGuide, user);
            if (isCompleted || remainRequiredPackageQty === 0) {
                await execute_vas_1.executeVas(trxMgr, wsd, domain, user);
            }
        });
    }
};
/**
 * @description Get total qty of repacked.
 *
 * @param {RepackedInvInfo[]} repackedInvs
 */
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
/**
 * @description Find repacked pallet which has same pallet id with passed pallet id as param
 * If there's no repacked pallet init new RepackedInvInfo object and return it
 *
 * @param {RepackagingGuide} operationGuideData
 * @param {String} palletId
 * @param {String} locationName
 */
function getRepackedInv(operationGuideData, palletId, locationName) {
    let repackedInv = operationGuideData.repackedInvs.find((ri) => ri.palletId === palletId);
    if (!repackedInv) {
        repackedInv = {
            palletId,
            locationName,
            repackedPkgQty: 0,
            repackedFrom: []
        };
        operationGuideData.repackedInvs.push(repackedInv);
    }
    return repackedInv;
}
//# sourceMappingURL=repackaging.js.map