"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const warehouse_base_1 = require("@things-factory/warehouse-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
const utils_1 = require("../../../utils");
exports.undoPutaway = {
    async undoPutaway(_, { worksheetDetailName, palletId }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            var _a;
            // 1. update status of worksheetDetail (DONE => EXECUTING)
            const foundWorksheetDetail = await trxMgr.getRepository(entities_1.WorksheetDetail).findOne({
                where: { domain: context.state.domain, name: worksheetDetailName, status: constants_1.WORKSHEET_STATUS.DONE },
                relations: [
                    'worksheet',
                    'worksheet.arrivalNotice',
                    'bizplace',
                    'fromLocation',
                    'toLocation',
                    'targetInventory',
                    'targetInventory.inventory'
                ]
            });
            if (!foundWorksheetDetail)
                throw new Error("Worksheet doesn't exists");
            const arrivalNotice = foundWorksheetDetail.worksheet.arrivalNotice;
            const targetInventory = foundWorksheetDetail.targetInventory;
            const foundInv = targetInventory.inventory;
            const foundOIs = await trxMgr.getRepository(sales_base_1.OrderInventory).find({
                where: {
                    domain: context.state.domain,
                    type: sales_base_1.ORDER_TYPES.RELEASE_OF_GOODS,
                    inventory: foundInv
                },
                relations: ['domain']
            });
            if ((_a = foundOIs) === null || _a === void 0 ? void 0 : _a.length)
                throw new Error('This Pallet ID has been selected for releasing');
            await trxMgr.getRepository(sales_base_1.OrderInventory).save(Object.assign(Object.assign({}, targetInventory), { status: sales_base_1.ORDER_PRODUCT_STATUS.PUTTING_AWAY, updater: context.state.user }));
            await trxMgr.getRepository(entities_1.WorksheetDetail).save(Object.assign(Object.assign({}, foundWorksheetDetail), { status: constants_1.WORKSHEET_STATUS.EXECUTING }));
            // 2. update inventory from shelf location to buffer location
            const foundInventory = await trxMgr.getRepository(warehouse_base_1.Inventory).findOne({
                where: { domain: context.state.domain, palletId },
                relations: ['location']
            });
            // 3. update status of location
            // 3. 1) if there's no inventories related with location => EMPTY
            const shelfLocation = foundInventory.location;
            const relatedInventory = await trxMgr.getRepository(warehouse_base_1.Inventory).findOne({
                where: { domain: context.state.domain, location: shelfLocation }
            });
            if (!relatedInventory) {
                await trxMgr.getRepository(warehouse_base_1.Location).save(Object.assign(Object.assign({}, shelfLocation), { status: warehouse_base_1.LOCATION_STATUS.EMPTY }));
            }
            // Update (Revert back) status and location of inventory
            const inventory = await trxMgr.getRepository(warehouse_base_1.Inventory).save(Object.assign(Object.assign({}, foundInventory), { location: await trxMgr.getRepository(warehouse_base_1.Location).findOne({
                    where: { domain: context.state.domain, name: foundWorksheetDetail.fromLocation.name }
                }), status: warehouse_base_1.INVENTORY_STATUS.UNLOADED, updater: context.state.user }));
            // Generate inventory history
            await utils_1.generateInventoryHistory(inventory, arrivalNotice, warehouse_base_1.INVENTORY_TRANSACTION_TYPE.UNDO_PUTAWAY, 0, 0, context.state.user, trxMgr);
        });
    }
};
//# sourceMappingURL=undo-putaway.js.map