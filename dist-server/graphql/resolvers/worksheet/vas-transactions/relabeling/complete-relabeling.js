"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const product_base_1 = require("@things-factory/product-base");
const sales_base_1 = require("@things-factory/sales-base");
const warehouse_base_1 = require("@things-factory/warehouse-base");
const common_utils_1 = require("../common-utils");
async function completeRelabeling(trxMgr, orderVas, user) {
    orderVas = await trxMgr.getRepository(sales_base_1.OrderVas).findOne(orderVas.id, {
        relations: ['domain', 'bizplace', 'inventory', 'inventory.product', 'arrivalNotice', 'releaseGood', 'vasOrder']
    });
    const domain = orderVas.domain;
    const bizplace = orderVas.bizplace;
    let originInv = orderVas.inventory;
    const operationGuide = JSON.parse(orderVas.operationGuide);
    const operationGuideData = operationGuide.data;
    const { toBatchId, toProduct } = operationGuideData;
    const { arrivalNotice, releaseGood, vasOrder } = orderVas;
    const refOrder = arrivalNotice || releaseGood || vasOrder;
    const palletChanges = extractRelabeledPallets(operationGuideData.relabeledFrom, orderVas.inventory.palletId);
    let copiedInv = Object.assign({}, originInv);
    if (toBatchId)
        copiedInv.batchId = toBatchId;
    if (toProduct)
        copiedInv.product = await trxMgr.getRepository(product_base_1.Product).findOne(toProduct.id);
    copiedInv.refInventory = originInv;
    for (const palletChange of palletChanges) {
        const newInventory = await common_utils_1.upsertInventory(trxMgr, domain, bizplace, user, copiedInv, refOrder, palletChange.toPalletId, palletChange.locationName, copiedInv.packingType, palletChange.reducedQty, palletChange.reducedWeight, warehouse_base_1.INVENTORY_TRANSACTION_TYPE.RELABELING);
        const { reducedQty, reducedWeight } = common_utils_1.getReducedAmount(palletChanges, orderVas.inventory.palletId);
        // Deduct amount of product on original pallet or order inventory (Case for release order)
        // originInv = await deductProductAmount(trxMgr, domain, bizplace, user, refOrder, originInv, qty, weight)
        originInv = await common_utils_1.deductProductAmount(trxMgr, domain, bizplace, user, refOrder, originInv, reducedQty, reducedWeight, warehouse_base_1.INVENTORY_TRANSACTION_TYPE.RELABELING);
        // Create worksheet if it's related with Arrival Notice or Release Order
        if (refOrder instanceof sales_base_1.ArrivalNotice) {
            await common_utils_1.createPutawayWorksheet(trxMgr, domain, bizplace, user, refOrder, originInv, newInventory);
        }
        else if (refOrder instanceof sales_base_1.ReleaseGood) {
            await common_utils_1.createLoadingWorksheet(trxMgr, domain, bizplace, user, refOrder, originInv, newInventory);
        }
    }
}
exports.completeRelabeling = completeRelabeling;
function extractRelabeledPallets(palletChanges, palletId) {
    return palletChanges.filter((pc) => pc.fromPalletId === palletId);
}
//# sourceMappingURL=complete-relabeling.js.map