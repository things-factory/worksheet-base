"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const warehouse_base_1 = require("@things-factory/warehouse-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
exports.inspecting = {
    async inspecting(_, { worksheetDetailName, palletId, locationName, inspectedQty }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            await executeInspection(worksheetDetailName, palletId, locationName, inspectedQty, context.state.domain, context.state.user, trxMgr);
        });
    }
};
async function executeInspection(worksheetDetailName, palletId, locationName, inspectedQty, domain, user, trxMgr) {
    // get worksheet detail
    const worksheetDetail = await trxMgr.getRepository(entities_1.WorksheetDetail).findOne({
        where: {
            domain,
            name: worksheetDetailName,
            status: constants_1.WORKSHEET_STATUS.EXECUTING,
            type: constants_1.WORKSHEET_TYPE.CYCLE_COUNT
        },
        relations: [
            'worksheet',
            'worksheet.releaseGood',
            'targetInventory',
            'targetInventory.inventory',
            'targetInventory.inventory.product',
            'targetInventory.inventory.warehouse',
            'targetInventory.inventory.location'
        ]
    });
    if (!worksheetDetail)
        throw new Error(`Worksheet Details doesn't exists`);
    // get location by name
    const beforeLocation = worksheetDetail.targetInventory.inventory.location;
    const currentLocation = await trxMgr.getRepository(warehouse_base_1.Location).findOne({
        where: { domain, name: locationName },
        relations: ['warehouse']
    });
    if (!currentLocation)
        throw new Error(`Location doesn't exists`);
    let targetInventory = worksheetDetail.targetInventory;
    let inventory = targetInventory.inventory;
    if (inventory.palletId !== palletId)
        throw new Error('Pallet ID is invalid');
    if (beforeLocation.name !== currentLocation.name || inspectedQty !== inventory.qty) {
        await trxMgr.getRepository(entities_1.WorksheetDetail).save(Object.assign(Object.assign({}, worksheetDetail), { status: constants_1.WORKSHEET_STATUS.NOT_TALLY, updater: user }));
        // Change status of order inventory
        await trxMgr.getRepository(sales_base_1.OrderInventory).save(Object.assign(Object.assign({}, targetInventory), { inspectedLocation: currentLocation, inspectedQty, status: sales_base_1.ORDER_INVENTORY_STATUS.NOT_TALLY, updater: user }));
    }
    else {
        await trxMgr.getRepository(entities_1.WorksheetDetail).save(Object.assign(Object.assign({}, worksheetDetail), { status: constants_1.WORKSHEET_STATUS.DONE, updater: user }));
        // Change status of order inventory
        await trxMgr.getRepository(sales_base_1.OrderInventory).save(Object.assign(Object.assign({}, targetInventory), { inspectedLocation: currentLocation, inspectedQty, status: sales_base_1.ORDER_INVENTORY_STATUS.INSPECTED, updater: user }));
    }
}
exports.executeInspection = executeInspection;
//# sourceMappingURL=inspecting.js.map