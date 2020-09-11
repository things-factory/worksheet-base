"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const warehouse_base_1 = require("@things-factory/warehouse-base");
const common_utils_1 = require("../common-utils");
async function completeRepalletizing(trxMgr, orderVas, user) {
    orderVas = await trxMgr.getRepository(sales_base_1.OrderVas).findOne(orderVas.id, {
        relations: ['domain', 'bizplace', 'inventory', 'inventory.product', 'arrivalNotice', 'releaseGood', 'vasOrder']
    });
    const domain = orderVas.domain;
    const bizplace = orderVas.bizplace;
    let originInv = orderVas.inventory;
    const operationGuide = JSON.parse(orderVas.operationGuide);
    const operationGuideData = operationGuide.data;
    const { arrivalNotice, releaseGood, vasOrder } = orderVas;
    const refOrder = arrivalNotice || releaseGood || vasOrder;
    // Check completion of new pallets
    if (!checkCompletion(operationGuideData)) {
        throw new Error(`There's repalletized pallet which doesn't have as many as standard qty`);
    }
    // create repalletized inventories based on repalletizedInvs
    const repalletizedInvs = extractRepackedInvs(operationGuideData, originInv);
    for (const ri of repalletizedInvs) {
        const repalletizedFromList = ri.repalletizedFrom.filter((rf) => rf.toPalletId === ri.palletId);
        const { qty, weight } = common_utils_1.getCurrentAmount(repalletizedFromList, ri.palletId);
        const changedInv = await common_utils_1.upsertInventory(trxMgr, domain, bizplace, user, originInv, refOrder, ri.palletId, ri.locationName, originInv.packingType, qty, weight, warehouse_base_1.INVENTORY_TRANSACTION_TYPE.REPALLETIZING);
        // Deduct amount of product on original pallet or order inventory (Case for release order)
        originInv = await common_utils_1.deductProductAmount(trxMgr, domain, bizplace, user, refOrder, originInv, qty, weight, warehouse_base_1.INVENTORY_TRANSACTION_TYPE.REPALLETIZING);
        // Create worksheet if it's related with Arrival Notice or Release Order
        if (refOrder instanceof sales_base_1.ArrivalNotice) {
            await common_utils_1.createPutawayWorksheet(trxMgr, domain, bizplace, user, refOrder, originInv, changedInv);
        }
        else if (refOrder instanceof sales_base_1.ReleaseGood) {
            await common_utils_1.createLoadingWorksheet(trxMgr, domain, bizplace, user, refOrder, originInv, changedInv);
        }
    }
}
exports.completeRepalletizing = completeRepalletizing;
/**
 * @description Check whether every repalletized pallet has products as many as standard qty.
 * @param operationGuideData
 */
function checkCompletion(operationGuideData) {
    const stdQty = operationGuideData.stdQty;
    return operationGuideData.repalletizedInvs.every((ri) => {
        const totalQty = ri.repalletizedFrom.reduce((totalQty, rf) => (totalQty += rf.reducedQty), 0);
        return totalQty === stdQty;
    });
}
function extractRepackedInvs(operationGuideData, originInv) {
    return operationGuideData.repalletizedInvs
        .filter((ri) => {
        const isPalletIncluded = Boolean(ri.repalletizedFrom.find((rf) => rf.fromPalletId === originInv.palletId));
        if (isPalletIncluded)
            return ri;
    })
        .map((ri) => {
        ri.repalletizedFrom = ri.repalletizedFrom.filter((rf) => rf.fromPalletId === originInv.palletId);
        return ri;
    });
}
//# sourceMappingURL=complete-repalletizing.js.map