"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const warehouse_base_1 = require("@things-factory/warehouse-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../../constants");
const entities_1 = require("../../../../entities");
const utils_1 = require("../../../../utils");
/**
 * @description Find worksheet detail by name
 * this function will include every relations with worksheet detail for processing VAS
 *
 * @param {EntityManager} trxMgr
 * @param {Domain} domain
 * @param {String} name
 */
async function getWorksheetDetailByName(trxMgr, domain, name) {
    const worksheetDetail = await trxMgr.getRepository(entities_1.WorksheetDetail).findOne({
        where: { domain, name },
        relations: [
            'bizplace',
            'targetVas',
            'targetVas.inventory',
            'targetVas.inventory.product',
            'targetVas.vas',
            'targetVas.arrivalNotice',
            'targetVas.releaseGood',
            'targetVas.shippingOrder',
            'targetVas.vasOrder',
            'targetVas.targetProduct',
            'worksheet'
        ]
    });
    if (!worksheetDetail)
        throw new Error(`Couldn't find target worksheet detail`);
    if (!worksheetDetail.targetVas)
        throw new Error(`Couldn't find any related target vas, using current worksheet detail`);
    return worksheetDetail;
}
exports.getWorksheetDetailByName = getWorksheetDetailByName;
/**
 * @description Update every related order vas to share same operationGuide data
 *
 * @param {EntityManager} trxMgr
 * @param {Domain} domain
 * @param {Bizplace} bizplace
 * @param {WorksheetDetail} wsd
 * @param {OrderVas} targetVas
 * @param {OperationGuideInterface<T>} operationGuide
 * @param {User} user
 */
async function updateRelatedOrderVas(trxMgr, domain, bizplace, wsd, targetVas, operationGuide, user) {
    const worksheet = wsd.worksheet;
    const relatedWSDs = await trxMgr.getRepository(entities_1.WorksheetDetail).find({
        where: { domain, bizplace, worksheet },
        relations: ['targetVas', 'targetVas.vas']
    });
    const relatedOVs = relatedWSDs
        .map((wsd) => wsd.targetVas)
        .filter((ov) => ov.set === targetVas.set && ov.vas.id === targetVas.vas.id)
        .map((ov) => {
        return Object.assign(Object.assign({}, ov), { operationGuide: JSON.stringify(operationGuide), updater: user });
    });
    await trxMgr.getRepository(sales_base_1.OrderVas).save(relatedOVs);
}
exports.updateRelatedOrderVas = updateRelatedOrderVas;
/**
 * @description Return current amount of pallet
 * @param {PalletChangesInterface[]} palletChanges
 * @param {String} palletId
 */
function getCurrentAmount(palletChanges, palletId) {
    return palletChanges
        .filter((pc) => pc.toPalletId === palletId)
        .reduce((currentAmount, pc) => {
        return {
            qty: currentAmount.qty + pc.reducedQty,
            weight: currentAmount.weight + pc.reducedWeight
        };
    }, { qty: 0, weight: 0 });
}
exports.getCurrentAmount = getCurrentAmount;
/**
 * @description Return reduced amount of pallet
 * @param {PalletChangesInterface[]} palletChanges
 * @param {String} palletId
 */
function getReducedAmount(palletChanges, palletId) {
    return palletChanges
        .filter((pc) => pc.fromPalletId === palletId)
        .reduce((reducedAmount, pc) => {
        return {
            reducedQty: reducedAmount.reducedQty + pc.reducedQty || 0,
            reducedWeight: reducedAmount.reducedWeight + pc.reducedWeight || 0
        };
    }, { reducedQty: 0, reducedWeight: 0 });
}
exports.getReducedAmount = getReducedAmount;
/**
 * @description Get remain qty of inventory or order inventory (For release good case)
 *
 * @param {EntityManager} trxMgr
 * @param {ArrivalNotice | ReleaseGood | VasOrder} refOrder
 * @param {Domain} domain
 * @param {Bizplace} bizplace
 * @param {Inventory} originInv
 * @param {RepackedInvInfo[]} repackedInvs
 * @param {String} palletId
 */
async function getRemainInventoryAmount(trxMgr, refOrder, domain, bizplace, originInv, palletChanges, palletId) {
    let remainQty = 0;
    let remainWeight = 0;
    const { reducedQty, reducedWeight } = getReducedAmount(palletChanges, palletId);
    if (refOrder instanceof sales_base_1.ReleaseGood) {
        // Find loading order inventory to figure out unit weight
        const orderInv = await trxMgr.getRepository(sales_base_1.OrderInventory).findOne({
            where: { domain, bizplace, inventory: originInv, releaseGood: refOrder, type: sales_base_1.ORDER_TYPES.RELEASE_OF_GOODS }
        });
        remainQty = orderInv.releaseQty - reducedQty;
        remainWeight = orderInv.releaseWeight - reducedWeight;
    }
    else {
        remainQty = originInv.qty - reducedQty;
        remainWeight = originInv.weight - reducedWeight;
    }
    if (remainQty <= 0 || remainWeight <= 0)
        throw new Error(`There's no more remaining product on the pallet`);
    return { remainQty, remainWeight };
}
exports.getRemainInventoryAmount = getRemainInventoryAmount;
/**
 * @description Assign inventory to targetVas
 * When Vas order comes together with Arrival Notice or Release Good
 * The vas worksheet is activated automatically by to complete unloading/picking worksheet.
 * As a result user can't activate it manually, which means no assignment for every specific vas tasks.
 * For this case inventory should be assigned while processing the VAS Order.
 */
async function assignInventory(trxMgr, domain, bizplace, user, wsd, refOrder, targetVas, palletId) {
    var _a;
    let inventory;
    if (refOrder instanceof sales_base_1.ArrivalNotice) {
        // Case 1. When the VAS Order comes with Arrival Notice
        inventory = await trxMgr.getRepository(warehouse_base_1.Inventory).findOne({
            where: {
                domain,
                bizplace,
                palletId,
                status: typeorm_1.In([warehouse_base_1.INVENTORY_STATUS.UNLOADED, warehouse_base_1.INVENTORY_STATUS.PUTTING_AWAY]),
                refOrderId: refOrder.id
            }
        });
        if (!inventory)
            throw new Error(`Counldn't find unloaded inventory by pallet ID: (${palletId})`);
        // Check current inventory has enough qty of product to complete this target vas.
        if (targetVas.qty > inventory.qty) {
            // If it doesn't have enough, Need to create new worksheet detail and target vas without inventory assignment
            // So the user can proceed it with another inventory
            targetVas = await addNewVasTask(targetVas, inventory.qty, inventory.weight, domain, bizplace, user, trxMgr, wsd);
        }
    }
    else if (refOrder instanceof sales_base_1.ReleaseGood) {
        // Case 2. When the VAS Order comes with Release Good
        // In this case, every available inventories are picked by picking worksheet.
        // So target inventories should be found by relation with order inventory which has PICKED status
        let pickedOrdInv = await trxMgr.getRepository(sales_base_1.OrderInventory).find({
            where: { domain, bizplace, releaseGood: refOrder, status: sales_base_1.ORDER_INVENTORY_STATUS.PICKED },
            relations: ['inventory']
        });
        pickedOrdInv = pickedOrdInv.find((oi) => oi.inventory.palletId === palletId);
        inventory = (_a = pickedOrdInv) === null || _a === void 0 ? void 0 : _a.inventory;
        if (!inventory)
            throw new Error(`Couldn't find picked inventory by pallet ID: ${palletId}`);
        // Check current target inventory (picked inventory) has enough qty of product to complete this target vas.
        // And available qty of products also restriced by picking. (Because customer requests do some vas for Release Order)
        if (targetVas.qty > pickedOrdInv.releaseQty) {
            // If it doesn't have enough, Need to create new worksheet detail and target vas without inventory assignment
            // So the user can proceed it with another inventory
            targetVas = await addNewVasTask(targetVas, pickedOrdInv.releaseQty, pickedOrdInv.releaseWeight, domain, bizplace, user, trxMgr, wsd);
        }
    }
    else {
        throw new Error(`Reference Order (${refOrder.name}) is not expected.`);
    }
    targetVas.inventory = inventory;
    targetVas.updater = user;
    return await trxMgr.getRepository(sales_base_1.OrderVas).save(targetVas);
}
exports.assignInventory = assignInventory;
/**
 * Dismiss assigne inventory when user click undo to remove
 * proceed pallet for relabel, repack, repack
 *
 * @param {EntityManager} trxMgr
 * @param {WorksheetDetail} wsd
 * @param {OrderVas} targetVas
 * @param {PalletChangesInterface[]} palletChanges
 * @param {String} palletId
 */
async function dismissInventory(trxMgr, wsd, targetVas, palletChanges, palletId) {
    // If there's no more item assigned with current from pallet id
    if (!palletChanges.find((rf) => rf.fromPalletId === palletId)) {
        targetVas.inventory = null;
        const worksheet = await trxMgr.getRepository(entities_1.Worksheet).findOne(wsd.worksheet.id, {
            relations: [
                'worksheetDetails',
                'worksheetDetails.targetVas',
                'worksheetDetails.targetVas.vas',
                'worksheetDetails.targetVas.inventory'
            ]
        });
        const nonFinishedWSD = worksheet.worksheetDetails.find((otherWSD) => otherWSD.id !== wsd.id &&
            otherWSD.targetVas.set === wsd.targetVas.set &&
            otherWSD.targetVas.vas.id === wsd.targetVas.vas.id &&
            otherWSD.status !== constants_1.WORKSHEET_STATUS.DONE);
        if (nonFinishedWSD) {
            // If there non finished same VAS, delete undo target record (worksheet detail & order vas)
            // Add qty and weight for non finished vas task
            await trxMgr.getRepository(entities_1.WorksheetDetail).delete(wsd.id);
            await trxMgr.getRepository(sales_base_1.OrderVas).delete(targetVas.id);
            nonFinishedWSD.targetVas.qty += targetVas.qty;
            nonFinishedWSD.targetVas.weight += targetVas.weight;
            await trxMgr.getRepository(sales_base_1.OrderVas).save(nonFinishedWSD.targetVas);
        }
        else {
            // If there no non finished same VAS, dismiss inventory for the record
            targetVas.inventory = null;
            await trxMgr.getRepository(sales_base_1.OrderVas).save(wsd.targetVas);
        }
    }
}
exports.dismissInventory = dismissInventory;
/**
 * @description Create nw VAS Worksheet Detail & Order Vas
 * Without inventory assignment
 */
async function addNewVasTask(targetVas, currentOrderQty, currentOrderWeight, domain, bizplace, user, trxMgr, wsd) {
    // Create new order vas & worksheet detail
    const copiedTargetVas = Object.assign({}, targetVas);
    delete copiedTargetVas.id;
    let newTargetVas = Object.assign(Object.assign({}, copiedTargetVas), { domain,
        bizplace, name: sales_base_1.OrderNoGenerator.orderVas(), qty: targetVas.qty - currentOrderQty, weight: targetVas.weight - currentOrderWeight, creator: user, updater: user });
    newTargetVas = await trxMgr.getRepository(sales_base_1.OrderVas).save(newTargetVas);
    const copiedWSD = Object.assign({}, wsd);
    delete copiedWSD.id;
    const newWSD = Object.assign(Object.assign({}, copiedWSD), { domain,
        bizplace, name: utils_1.WorksheetNoGenerator.vasDetail(), seq: wsd.seq++, targetVas: newTargetVas, creator: user, updater: user });
    await trxMgr.getRepository(entities_1.WorksheetDetail).save(newWSD);
    targetVas.qty = currentOrderQty;
    targetVas.weight = currentOrderWeight;
    return targetVas;
}
exports.addNewVasTask = addNewVasTask;
async function upsertInventory(trxMgr, domain, bizplace, user, originInv, refOrder, palletId, locationName, packingType, addedQty, addedWeight, transactionType) {
    const location = await trxMgr.getRepository(warehouse_base_1.Location).findOne({
        where: { domain, name: locationName },
        relations: ['warehouse']
    });
    if (!location)
        throw new Error(`Location is not found by (${locationName})`);
    const warehouse = location.warehouse;
    const zone = location.zone;
    let inv = await trxMgr.getRepository(warehouse_base_1.Inventory).findOne({
        where: {
            domain,
            bizplace,
            palletId,
            batchId: originInv.batchId,
            product: originInv.product,
            packingType,
            refOrderId: originInv.refOrderId,
            status: typeorm_1.Not(typeorm_1.Equal(warehouse_base_1.INVENTORY_STATUS.TERMINATED))
        },
        relations: ['product', 'refInventory']
    });
    // Create new inventory
    if (!inv) {
        const copiedInv = Object.assign({}, originInv);
        delete copiedInv.id;
        inv = Object.assign(Object.assign({}, copiedInv), { domain,
            bizplace,
            palletId, name: warehouse_base_1.InventoryNoGenerator.inventoryName(), packingType, qty: addedQty, weight: addedWeight, warehouse,
            location,
            zone, creator: user, updater: user });
        // Save changed inventory
        inv = await trxMgr.getRepository(warehouse_base_1.Inventory).save(inv);
        // Check whether the pallet is resuable or not
        const pallet = await trxMgr.getRepository(warehouse_base_1.Pallet).findOne({
            where: { domain, name: palletId, inventory: typeorm_1.IsNull() }
        });
        // If it's exists => it's reusable pallet and need to update it's inventory field
        if (pallet) {
            pallet.inventory = inv;
            pallet.updater = user;
            await trxMgr.getRepository(warehouse_base_1.Pallet).save(pallet);
        }
    }
    else {
        // Update inventory
        inv.qty += addedQty;
        inv.weight += addedWeight;
        inv.warehouse = warehouse;
        inv.location = location;
        inv.zone = location.zone;
        inv.updater = user;
        // Save changed inventory
        inv = await trxMgr.getRepository(warehouse_base_1.Inventory).save(inv);
    }
    // Create inventory history
    await utils_1.generateInventoryHistory(inv, refOrder, transactionType, addedQty, addedWeight, user, trxMgr);
    return inv;
}
exports.upsertInventory = upsertInventory;
async function deductProductAmount(trxMgr, domain, bizplace, user, refOrder, originInv, reducedQty, reducedWeight, transactionType) {
    if (refOrder instanceof sales_base_1.ReleaseGood) {
        const loadingWS = await trxMgr.getRepository(entities_1.Worksheet).findOne({
            where: { domain, bizplace, releaseGood: refOrder, type: constants_1.WORKSHEET_TYPE.LOADING },
            relations: ['worksheetDetails', 'worksheetDetails.targetInventory', 'worksheetDetails.targetInventory.inventory']
        });
        if (!loadingWS)
            throw new Error(`Picking process is not finished yet. Please complete picking first before complete Repalletizing`);
        const orderInv = loadingWS.worksheetDetails
            .map((wsd) => wsd.targetInventory)
            .find((oi) => oi.inventory.id === originInv.id);
        if (!orderInv) {
            throw new Error(`Failed to find order inventory (Pallet ID: ${originInv.palletId})`);
        }
        orderInv.releaseQty -= reducedQty;
        orderInv.releaseWeight -= reducedWeight;
        orderInv.updater = user;
        await trxMgr.getRepository(sales_base_1.OrderInventory).save(orderInv);
    }
    else {
        originInv.qty -= reducedQty;
        originInv.weight -= reducedWeight;
        originInv.updater = user;
        originInv.status = originInv.qty <= 0 || originInv.weight <= 0 ? warehouse_base_1.INVENTORY_STATUS.TERMINATED : originInv.status;
        originInv = await trxMgr.getRepository(warehouse_base_1.Inventory).save(originInv);
        await utils_1.generateInventoryHistory(originInv, refOrder, transactionType, -reducedQty, -reducedWeight, user, trxMgr);
    }
    return originInv;
}
exports.deductProductAmount = deductProductAmount;
async function createPutawayWorksheet(trxMgr, domain, bizplace, user, refOrder, originInv, changedInv) {
    const putawayWS = await trxMgr.getRepository(entities_1.Worksheet).findOne({
        where: { domain, bizplace, arrivalNotice: refOrder, type: constants_1.WORKSHEET_TYPE.PUTAWAY },
        relations: ['worksheetDetails', 'worksheetDetails.targetInventory', 'worksheetDetails.targetInventory.inventory']
    });
    if (!putawayWS) {
        throw new Error(`Unloading process is not finished yet. Please complete unloading first before complete Repalletizing`);
    }
    const putawayWSDs = putawayWS.worksheetDetails;
    const originalWSD = putawayWSDs.find((wsd) => wsd.targetInventory.inventory.id === originInv.id);
    const originOrdInv = originalWSD.targetInventory;
    const sameTargetWSD = putawayWSDs.find((wsd) => wsd.targetInventory.inventory.id === changedInv.id);
    if (!sameTargetWSD) {
        // Create new order inventory
        const copiedOrdInv = Object.assign({}, originOrdInv);
        delete copiedOrdInv.id;
        let newOrdInv = Object.assign(Object.assign({}, copiedOrdInv), { domain,
            bizplace, name: sales_base_1.OrderNoGenerator.orderInventory(), type: sales_base_1.ORDER_TYPES.ARRIVAL_NOTICE, arrivalNotice: refOrder, inventory: changedInv, creator: user, updater: user });
        newOrdInv = await trxMgr.getRepository(sales_base_1.OrderInventory).save(newOrdInv);
        const copiedWSD = Object.assign({}, originalWSD);
        delete copiedWSD.id;
        let newWSD = Object.assign(Object.assign({}, copiedWSD), { domain,
            bizplace, worksheet: putawayWS, name: utils_1.WorksheetNoGenerator.putawayDetail(), targetInventory: newOrdInv, type: constants_1.WORKSHEET_TYPE.PUTAWAY, creator: user, updater: user });
        newWSD = await trxMgr.getRepository(entities_1.WorksheetDetail).save(newWSD);
    }
    // Update origin order inventory
    if (originInv.status === warehouse_base_1.INVENTORY_STATUS.TERMINATED) {
        await trxMgr.getRepository(entities_1.WorksheetDetail).delete(originalWSD.id);
        originOrdInv.status = sales_base_1.ORDER_INVENTORY_STATUS.DONE;
        originOrdInv.updater = user;
        await trxMgr.getRepository(sales_base_1.OrderInventory).save(originOrdInv);
    }
}
exports.createPutawayWorksheet = createPutawayWorksheet;
async function createLoadingWorksheet(trxMgr, domain, bizplace, user, refOrder, originInv, changedInv) {
    const changedQty = changedInv.qty;
    const changedWeight = changedInv.weight;
    const loadingWS = await trxMgr.getRepository(entities_1.Worksheet).findOne({
        where: { domain, bizplace, releaseGood: refOrder, type: constants_1.WORKSHEET_TYPE.LOADING },
        relations: ['worksheetDetails', 'worksheetDetails.targetInventory', 'worksheetDetails.targetInventory.inventory']
    });
    if (!loadingWS) {
        throw new Error(`Picking process is not finished yet. Please complete picking first before complete Repalletizing`);
    }
    const loadingWSDs = loadingWS.worksheetDetails;
    const originalWSD = loadingWSDs.find((wsd) => wsd.targetInventory.inventory.id === originInv.id);
    const originOrdInv = originalWSD.targetInventory;
    const sameTargetWSD = loadingWSDs.find((wsd) => {
        const targetOI = wsd.targetInventory;
        const targetInv = targetOI.inventory;
        const targetUnitWeight = targetOI.releaseWeight / targetOI.releaseQty;
        const changeUnitWeight = changedWeight / changedQty;
        if (targetInv.palletId === changedInv.palletId &&
            targetInv.batchId === changedInv.batchId &&
            targetInv.packingType === changedInv.packingType &&
            targetUnitWeight === changeUnitWeight) {
            return wsd;
        }
    });
    if (!sameTargetWSD) {
        // Create new order inventory
        const copiedOrderInv = Object.assign({}, originOrdInv);
        delete copiedOrderInv.id;
        let newOrdInv = await trxMgr.getRepository(sales_base_1.OrderInventory).save(Object.assign(Object.assign({}, copiedOrderInv), { domain,
            bizplace, releaseQty: changedQty, releaseWeight: changedWeight, name: sales_base_1.OrderNoGenerator.orderInventory(), type: sales_base_1.ORDER_TYPES.RELEASE_OF_GOODS, releaseGood: refOrder, inventory: changedInv, creator: user, updater: user }));
        newOrdInv = await trxMgr.getRepository(sales_base_1.OrderInventory).save(newOrdInv);
        const copiedWSD = Object.assign({}, originalWSD);
        delete copiedWSD.id;
        let newWSD = Object.assign(Object.assign({}, copiedWSD), { domain,
            bizplace, worksheet: loadingWS, name: utils_1.WorksheetNoGenerator.loadingDetail(), targetInventory: newOrdInv, type: constants_1.WORKSHEET_TYPE.LOADING, creator: user, updater: user });
        await trxMgr.getRepository(entities_1.WorksheetDetail).save(newWSD);
    }
    else {
        let sameTargetInv = sameTargetWSD.targetInventory;
        sameTargetInv.releaseQty += changedQty;
        sameTargetInv.releaseWeight += changedWeight;
        sameTargetInv.updater = user;
        await trxMgr.getRepository(sales_base_1.OrderInventory).save(sameTargetInv);
    }
    // Update inventory to PICKED inventory
    changedInv = await trxMgr.getRepository(warehouse_base_1.Inventory).save(Object.assign(Object.assign({}, changedInv), { qty: changedInv.qty - changedQty, weight: changedInv.weight - changedWeight, updater: user }));
    // Generate PICKING inventory history
    await utils_1.generateInventoryHistory(changedInv, refOrder, warehouse_base_1.INVENTORY_TRANSACTION_TYPE.PICKING, -changedQty, -changedWeight, user, trxMgr);
    // Generate TERMINATED inventory history
    await utils_1.generateInventoryHistory(changedInv, refOrder, warehouse_base_1.INVENTORY_TRANSACTION_TYPE.TERMINATED, 0, 0, user, trxMgr);
    // Delete worksheet detail & order inventory
    // If order inventory doesn't have release qty any more
    if (originOrdInv.releaseQty <= 0) {
        await trxMgr.getRepository(entities_1.WorksheetDetail).delete(originalWSD.id);
        originInv.status = sales_base_1.ORDER_INVENTORY_STATUS.DONE;
        originInv.updater = user;
        await trxMgr.getRepository(sales_base_1.OrderInventory).save(originInv);
    }
}
exports.createLoadingWorksheet = createLoadingWorksheet;
//# sourceMappingURL=common-utils.js.map