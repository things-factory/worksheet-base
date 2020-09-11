"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const product_base_1 = require("@things-factory/product-base");
const warehouse_base_1 = require("@things-factory/warehouse-base");
const typeorm_1 = require("typeorm");
/**
 * @description It will insert new record into inventory histories table.
 * seq will be calculated based on number of records for one specific pallet id (provided by inventory object)
 */
async function generateInventoryHistory(inventory, refOrder, transactionType, qty, weight, user, trxMgr) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    const invHistoryRepo = ((_a = trxMgr) === null || _a === void 0 ? void 0 : _a.getRepository(warehouse_base_1.InventoryHistory)) || typeorm_1.getRepository(warehouse_base_1.InventoryHistory);
    const invRepo = ((_b = trxMgr) === null || _b === void 0 ? void 0 : _b.getRepository(warehouse_base_1.Inventory)) || typeorm_1.getRepository(warehouse_base_1.Inventory);
    if (!((_c = inventory) === null || _c === void 0 ? void 0 : _c.id))
        throw new Error(`Can't find out ID of inventory.`);
    if (!((_d = refOrder) === null || _d === void 0 ? void 0 : _d.id) || !refOrder.name)
        throw new Error(`Can't find out ID or Name of Reference Order`);
    if (!((_e = inventory) === null || _e === void 0 ? void 0 : _e.domain) ||
        !((_f = inventory) === null || _f === void 0 ? void 0 : _f.bizplace) ||
        !((_h = (_g = inventory) === null || _g === void 0 ? void 0 : _g.product) === null || _h === void 0 ? void 0 : _h.id) ||
        !((_k = (_j = inventory) === null || _j === void 0 ? void 0 : _j.warehouse) === null || _k === void 0 ? void 0 : _k.id) ||
        !((_m = (_l = inventory) === null || _l === void 0 ? void 0 : _l.location) === null || _m === void 0 ? void 0 : _m.id)) {
        inventory = await invRepo.findOne({
            where: { id: inventory.id },
            relations: ['domain', 'bizplace', 'product', 'warehouse', 'location']
        });
    }
    const domain = inventory.domain;
    const location = inventory.location;
    const seq = await invHistoryRepo.count({ domain: inventory.domain, palletId: inventory.palletId });
    let openingQty = 0;
    let openingWeight = 0;
    if (seq) {
        const lastInvHistory = await invHistoryRepo.findOne({
            domain: inventory.domain,
            palletId: inventory.palletId,
            seq: seq - 1
        });
        openingQty = lastInvHistory.openingQty + lastInvHistory.qty;
        openingWeight = lastInvHistory.openingWeight + lastInvHistory.weight;
    }
    let inventoryHistory = Object.assign(Object.assign({}, inventory), { name: warehouse_base_1.InventoryNoGenerator.inventoryHistoryName(), seq,
        transactionType, refOrderId: refOrder.id, orderNo: refOrder.name, orderRefNo: refOrder.refNo || null, productId: inventory.product.id, reusablePallet: inventory.reusablePallet, warehouseId: inventory.warehouse.id, locationId: inventory.location.id, qty,
        openingQty,
        weight,
        openingWeight, creator: user, updater: user });
    delete inventoryHistory.id;
    inventoryHistory = await invHistoryRepo.save(inventoryHistory);
    if (inventory.lastSeq !== seq) {
        await invRepo.save(Object.assign(Object.assign({}, inventory), { lastSeq: inventoryHistory.seq, updater: user }));
    }
    await switchLocationStatus(domain, location, user, trxMgr);
    return inventoryHistory;
}
exports.generateInventoryHistory = generateInventoryHistory;
/**
 * @description: Check location emptiness and update status of location
 * @param domain
 * @param location
 * @param updater
 * @param trxMgr
 */
async function switchLocationStatus(domain, location, updater, trxMgr) {
    var _a, _b;
    const invRepo = ((_a = trxMgr) === null || _a === void 0 ? void 0 : _a.getRepository(warehouse_base_1.Inventory)) || typeorm_1.getRepository(warehouse_base_1.Inventory);
    const locationRepo = ((_b = trxMgr) === null || _b === void 0 ? void 0 : _b.getRepository(warehouse_base_1.Location)) || typeorm_1.getRepository(warehouse_base_1.Location);
    const allocatedItemsCnt = await invRepo.count({
        domain,
        status: warehouse_base_1.INVENTORY_STATUS.STORED,
        location
    });
    if (!allocatedItemsCnt && location.status !== warehouse_base_1.LOCATION_STATUS.EMPTY) {
        location = await locationRepo.save(Object.assign(Object.assign({}, location), { status: warehouse_base_1.LOCATION_STATUS.EMPTY, updater }));
    }
    else if (allocatedItemsCnt && location.status === warehouse_base_1.LOCATION_STATUS.EMPTY) {
        location = await locationRepo.save(Object.assign(Object.assign({}, location), { status: warehouse_base_1.LOCATION_STATUS.OCCUPIED, updater }));
    }
    return location;
}
exports.switchLocationStatus = switchLocationStatus;
async function checkPalletDuplication(domain, bizplace, palletId, trxMgr) {
    var _a;
    const invRepo = ((_a = trxMgr) === null || _a === void 0 ? void 0 : _a.getRepository(warehouse_base_1.Inventory)) || typeorm_1.getRepository(warehouse_base_1.Inventory);
    const duplicatedPalletCnt = await invRepo.count({
        domain,
        bizplace,
        palletId
    });
    return Boolean(duplicatedPalletCnt);
}
exports.checkPalletDuplication = checkPalletDuplication;
/**
 * @description Check whether inventory is same with passed conditions
 * @param {Domain} domain
 * @param {Bizplace} bizplace
 * @param {String} palletId
 * @param {String} batchId
 * @param {String | Product} product
 * @param {String} packingType
 * @param {EntityManager} trxMgr
 */
async function checkPalletIdenticallity(domain, bizplace, palletId, batchId, product, packingType, trxMgr) {
    var _a, _b, _c, _d, _e;
    const productRepo = ((_a = trxMgr) === null || _a === void 0 ? void 0 : _a.getRepository(product_base_1.Product)) || typeorm_1.getRepository(product_base_1.Product);
    const invRepo = ((_b = trxMgr) === null || _b === void 0 ? void 0 : _b.getRepository(warehouse_base_1.Inventory)) || typeorm_1.getRepository(warehouse_base_1.Inventory);
    if (typeof product === 'string') {
        const foundProduct = await productRepo.findOne(product);
        if (!foundProduct)
            throw new Error(`Failed to find product with ${product}`);
        product = foundProduct;
    }
    const inv = await invRepo.findOne({
        where: { domain, bizplace, palletId },
        relations: ['product']
    });
    if (batchId !== inv.batchId)
        return { identicallity: false, errorMessage: `Batch ID is not matched with ${batchId}` };
    if (((_c = product) === null || _c === void 0 ? void 0 : _c.id) !== ((_e = (_d = inv) === null || _d === void 0 ? void 0 : _d.product) === null || _e === void 0 ? void 0 : _e.id))
        return { identicallity: false, errorMessage: `Product is not matched with ${product.name}` };
    if (packingType !== inv.packingType)
        return { identicallity: false, errorMessage: `Packing Type is not matched with ${packingType}` };
    return { identicallity: true };
}
exports.checkPalletIdenticallity = checkPalletIdenticallity;
//# sourceMappingURL=inventory-util.js.map