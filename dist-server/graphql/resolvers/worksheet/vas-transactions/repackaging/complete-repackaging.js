"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const warehouse_base_1 = require("@things-factory/warehouse-base");
const common_utils_1 = require("../common-utils");
const interfaces_1 = require("../interfaces");
async function completeRepackaging(trxMgr, orderVas, user) {
    orderVas = await trxMgr.getRepository(sales_base_1.OrderVas).findOne(orderVas.id, {
        relations: ['domain', 'bizplace', 'inventory', 'inventory.product', 'arrivalNotice', 'releaseGood', 'vasOrder']
    });
    const domain = orderVas.domain;
    const bizplace = orderVas.bizplace;
    let originInv = orderVas.inventory;
    const operationGuide = JSON.parse(orderVas.operationGuide);
    const operationGuideData = operationGuide.data;
    const packingUnit = operationGuideData.packingUnit;
    const stdAmount = operationGuideData.stdAmount;
    const toPackingType = operationGuideData.toPackingType;
    const { arrivalNotice, releaseGood, vasOrder } = orderVas;
    const refOrder = arrivalNotice || releaseGood || vasOrder;
    const repackedInvs = extractRepackedInvs(operationGuideData, originInv);
    // create repacked inventories based on repackedInvs
    for (const ri of repackedInvs) {
        const repackedFromList = ri.repackedFrom.filter((rf) => rf.toPalletId === ri.palletId);
        const { qty, weight } = common_utils_1.getCurrentAmount(repackedFromList, ri.palletId);
        const repackedPkgQty = packingUnit === interfaces_1.PackingUnits.QTY ? qty / stdAmount : weight / stdAmount;
        const changedInv = await common_utils_1.upsertInventory(trxMgr, domain, bizplace, user, originInv, refOrder, ri.palletId, ri.locationName, toPackingType, repackedPkgQty, weight, warehouse_base_1.INVENTORY_TRANSACTION_TYPE.REPACKAGING);
        // Deduct amount of product on original pallet or order inventory (Case for release order)
        originInv = await common_utils_1.deductProductAmount(trxMgr, domain, bizplace, user, refOrder, originInv, qty, weight, warehouse_base_1.INVENTORY_TRANSACTION_TYPE.REPACKAGING);
        // Create worksheet if it's related with Arrival Notice or Release Order
        if (refOrder instanceof sales_base_1.ArrivalNotice) {
            // await createPutawayWorksheet(trxMgr, domain, bizplace, refOrder, originInv, changedInv, user)
            await common_utils_1.createPutawayWorksheet(trxMgr, domain, bizplace, user, refOrder, originInv, changedInv);
        }
        else if (refOrder instanceof sales_base_1.ReleaseGood) {
            // await createLoadingWorksheet(trxMgr, domain, bizplace, refOrder, originInv, changedInv, user)
            await common_utils_1.createLoadingWorksheet(trxMgr, domain, bizplace, user, refOrder, originInv, changedInv);
        }
    }
}
exports.completeRepackaging = completeRepackaging;
function extractRepackedInvs(operationGuideData, originInv) {
    return operationGuideData.repackedInvs
        .filter((ri) => {
        const isPalletIncluded = Boolean(ri.repackedFrom.find((rf) => rf.fromPalletId === originInv.palletId));
        if (isPalletIncluded)
            return ri;
    })
        .map((ri) => {
        ri.repackedFrom = ri.repackedFrom.filter((rf) => rf.fromPalletId === originInv.palletId);
        return ri;
    });
}
//# sourceMappingURL=complete-repackaging.js.map