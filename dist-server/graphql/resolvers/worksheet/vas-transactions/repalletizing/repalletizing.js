"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const warehouse_base_1 = require("@things-factory/warehouse-base");
const typeorm_1 = require("typeorm");
const utils_1 = require("../../../../../utils");
const execute_vas_1 = require("../../execute-vas");
const common_utils_1 = require("../common-utils");
exports.repalletizingResolver = {
    async repalletizing(_, { worksheetDetailName, fromPalletId, toPalletId, locationName }, context) {
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
            const palletType = operationGuideData.palletType;
            if (palletType === warehouse_base_1.PALLET_TYPES.REUSABLE_PALLET) {
                // Check whether the pallet is available
                const pallet = await trxMgr.getRepository(warehouse_base_1.Pallet).findOne({
                    where: { domain, name: toPalletId },
                    relatoins: ['inventory']
                });
                if (!pallet)
                    throw new Error(`Couldn't find reusable pallet by its ID (${toPalletId})`);
                if (pallet.inventory)
                    throw new Error(`The pallet (${toPalletId}) is located already.`);
            }
            if (!operationGuideData.repalletizedInvs)
                operationGuideData.repalletizedInvs = [];
            const repalletizedInvs = operationGuideData.repalletizedInvs;
            const palletChanges = repalletizedInvs
                .map((ri) => ri.repalletizedFrom)
                .flat();
            const { remainQty, remainWeight } = await common_utils_1.getRemainInventoryAmount(trxMgr, refOrder, domain, bizplace, originInv, palletChanges, fromPalletId);
            const unitWeight = remainWeight / remainQty;
            const stdQty = operationGuideData.stdQty;
            const { qty } = common_utils_1.getCurrentAmount(palletChanges, toPalletId);
            const requiredQty = stdQty - qty;
            if (requiredQty === 0)
                throw new Error(`The pallet (${toPalletId}) is repalletized already.`);
            const reducedQty = remainQty >= requiredQty ? requiredQty : remainQty;
            const repalletizedInv = getRepalletizedInv(operationGuideData, toPalletId, locationName);
            const repalletizedFrom = {
                fromPalletId,
                toPalletId,
                reducedQty,
                reducedWeight: reducedQty * unitWeight
            };
            repalletizedInv.repalletizedFrom.push(repalletizedFrom);
            const isCompleted = qty + reducedQty === stdQty;
            let requiredPalletQty = isCompleted
                ? operationGuideData.requiredPalletQty - 1
                : operationGuideData.requiredPalletQty;
            operationGuide.data = {
                palletType: operationGuideData.palletType,
                stdQty: operationGuideData.stdQty,
                requiredPalletQty,
                repalletizedInvs
            };
            // Update every order vas to share same operation guide
            await common_utils_1.updateRelatedOrderVas(trxMgr, domain, bizplace, wsd, targetVas, operationGuide, user);
            // If pallet is created completely
            // If there's no more products on from pallet
            if (remainQty - reducedQty === 0 || requiredPalletQty === 0) {
                await execute_vas_1.executeVas(trxMgr, wsd, domain, user);
            }
        });
    }
};
/**
 * @description Find repalletized pallet which has same pallet id with passed pallet id as param
 * If there's no repalletized pallet init new RepalletizedInvInfo object and return it
 *
 * @param {RepalletizedInvInfo} operationGuideData
 * @param {String} palletId
 * @param {String} locationName
 */
function getRepalletizedInv(operationGuideData, palletId, locationName) {
    let repalletizedInv = operationGuideData.repalletizedInvs.find((ri) => ri.palletId === palletId);
    if (!repalletizedInv) {
        repalletizedInv = {
            palletId,
            locationName,
            repalletizedFrom: []
        };
        operationGuideData.repalletizedInvs.push(repalletizedInv);
    }
    return repalletizedInv;
}
//# sourceMappingURL=repalletizing.js.map