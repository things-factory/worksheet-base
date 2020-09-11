"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const warehouse_base_1 = require("@things-factory/warehouse-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
const utils_1 = require("../../../utils");
exports.returning = {
    async returning(_, { worksheetDetailName, palletId, toLocation }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            // 1. get worksheet detail
            const worksheetDetail = await trxMgr.getRepository(entities_1.WorksheetDetail).findOne({
                where: {
                    domain: context.state.domain,
                    name: worksheetDetailName,
                    status: constants_1.WORKSHEET_STATUS.EXECUTING,
                    type: constants_1.WORKSHEET_TYPE.RETURN
                },
                relations: [
                    'bizplace',
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
            const releaseGood = worksheetDetail.worksheet.releaseGood;
            let targetInventory = worksheetDetail.targetInventory;
            let inventory = targetInventory.inventory;
            const worksheet = worksheetDetail.worksheet;
            if (!worksheet)
                throw new Error(`Worksheet doesn't exists`);
            const originLocation = inventory.location;
            const originPalletId = inventory.palletId;
            // 3. get stored location object
            const foundLocation = await trxMgr.getRepository(warehouse_base_1.Location).findOne({
                where: { domain: context.state.domain, name: toLocation },
                relations: ['warehouse']
            });
            if (!foundLocation)
                throw new Error(`Location doesn't exists`);
            const isPalletDiff = originPalletId !== palletId;
            const isLocationDiff = originLocation.id !== foundLocation.id;
            if (isPalletDiff)
                throw new Error(`Pallet ID is not matched`);
            // Case 1. Return back with SAME PALLET and SAME LOCATION.
            //      1) sum stored qty and returned qty
            if (!isPalletDiff && !isLocationDiff) {
                inventory = await trxMgr.getRepository(warehouse_base_1.Inventory).save(Object.assign(Object.assign({}, inventory), { qty: inventory.qty + targetInventory.releaseQty, weight: inventory.weight + targetInventory.releaseWeight, status: warehouse_base_1.INVENTORY_STATUS.STORED, updater: context.state.user }));
                // Case 2. Return back with SAME PALLET but DIFF LOCATION.
                //      1) check existing of stored pallet
                //      1). a. if yes throw error (Pallet ID can't be duplicated)
                //      1). b. if no (update qty and status and location)
            }
            else if (!isPalletDiff && isLocationDiff) {
                inventory = await trxMgr.getRepository(warehouse_base_1.Inventory).save(Object.assign(Object.assign({}, inventory), { location: foundLocation, qty: inventory.qty + targetInventory.releaseQty, weight: inventory.weight + targetInventory.releaseWeight, status: warehouse_base_1.INVENTORY_STATUS.STORED, updater: context.state.user }));
            }
            await utils_1.generateInventoryHistory(inventory, releaseGood, warehouse_base_1.INVENTORY_TRANSACTION_TYPE.RETURN, targetInventory.releaseQty, targetInventory.releaseWeight, context.state.user, trxMgr);
            // 7. update status of order inventory
            await trxMgr.getRepository(sales_base_1.OrderInventory).save(Object.assign(Object.assign({}, targetInventory), { status: sales_base_1.ORDER_INVENTORY_STATUS.TERMINATED, updater: context.state.user }));
            // 8. update status of worksheet details (EXECUTING => DONE)
            await trxMgr.getRepository(entities_1.WorksheetDetail).save(Object.assign(Object.assign({}, worksheetDetail), { status: constants_1.WORKSHEET_STATUS.DONE, updater: context.state.user }));
        });
    }
};
//# sourceMappingURL=returning.js.map