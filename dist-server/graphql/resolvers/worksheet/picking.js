"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const warehouse_base_1 = require("@things-factory/warehouse-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
const utils_1 = require("../../../utils");
exports.picking = {
    async picking(_, { worksheetDetailName, palletId, locationName, releaseQty }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            await executePicking(worksheetDetailName, palletId, locationName, releaseQty, context.state.domain, context.state.user, trxMgr);
        });
    }
};
async function executePicking(worksheetDetailName, palletId, locationName, releaseQty, domain, user, trxMgr) {
    // get worksheet detail
    const worksheetDetail = await trxMgr.getRepository(entities_1.WorksheetDetail).findOne({
        where: {
            domain,
            name: worksheetDetailName,
            status: constants_1.WORKSHEET_STATUS.EXECUTING,
            type: constants_1.WORKSHEET_TYPE.PICKING
        },
        relations: [
            'worksheet',
            'worksheet.releaseGood',
            'targetInventory',
            'targetInventory.inventory',
            'targetInventory.inventory.bizplace',
            'targetInventory.inventory.product',
            'targetInventory.inventory.warehouse',
            'targetInventory.inventory.location'
        ]
    });
    if (!worksheetDetail)
        throw new Error(`Worksheet Details doesn't exists`);
    let targetInventory = worksheetDetail.targetInventory;
    let inventory = targetInventory.inventory;
    if (inventory.palletId !== palletId)
        throw new Error('Pallet ID is invalid');
    const leftQty = inventory.qty - releaseQty;
    if (leftQty < 0)
        throw new Error(`Invalid qty, can't exceed limitation`);
    // Change status of order inventory
    await trxMgr.getRepository(sales_base_1.OrderInventory).save(Object.assign(Object.assign({}, targetInventory), { status: sales_base_1.ORDER_INVENTORY_STATUS.PICKED, updater: user }));
    // Change inventory data to release locked qty
    inventory = await trxMgr.getRepository(warehouse_base_1.Inventory).save(Object.assign(Object.assign({}, inventory), { qty: inventory.qty - targetInventory.releaseQty, weight: Math.round((inventory.weight - targetInventory.releaseWeight) * 100) / 100, lockedQty: 0, lockedWeight: 0, updater: user }));
    await utils_1.generateInventoryHistory(inventory, worksheetDetail.worksheet.releaseGood, warehouse_base_1.INVENTORY_TRANSACTION_TYPE.PICKING, -targetInventory.releaseQty, -targetInventory.releaseWeight, user, trxMgr);
    // update status of worksheet details (EXECUTING = > DONE)
    await trxMgr.getRepository(entities_1.WorksheetDetail).save(Object.assign(Object.assign({}, worksheetDetail), { status: constants_1.WORKSHEET_STATUS.DONE, updater: user }));
    // No more item for the pallet => TERMINATE inventory
    if (leftQty === 0) {
        inventory = await trxMgr.getRepository(warehouse_base_1.Inventory).save(Object.assign(Object.assign({}, inventory), { status: warehouse_base_1.INVENTORY_STATUS.TERMINATED, updater: user }));
        await utils_1.generateInventoryHistory(inventory, worksheetDetail.worksheet.releaseGood, warehouse_base_1.INVENTORY_TRANSACTION_TYPE.TERMINATED, 0, 0, user, trxMgr);
    }
    const fromLocation = worksheetDetail.targetInventory.inventory.location;
    if (locationName) {
        // get location by name
        const toLocation = await trxMgr.getRepository(warehouse_base_1.Location).findOne({
            where: { domain, name: locationName },
            relations: ['warehouse']
        });
        if (!toLocation)
            throw new Error(`Location doesn't exists`);
        // If toLocation is not same with fromLocation => Relocate inventory
        if (fromLocation.id !== toLocation.id) {
            inventory = await trxMgr.getRepository(warehouse_base_1.Inventory).save(Object.assign(Object.assign({}, inventory), { location: toLocation, warehouse: toLocation.warehouse, zone: toLocation.zone, updater: user }));
            await utils_1.generateInventoryHistory(inventory, worksheetDetail.worksheet.releaseGood, warehouse_base_1.INVENTORY_TRANSACTION_TYPE.RELOCATE, 0, 0, user, trxMgr);
            await utils_1.switchLocationStatus(domain, fromLocation, user, trxMgr);
        }
    }
}
exports.executePicking = executePicking;
//# sourceMappingURL=picking.js.map