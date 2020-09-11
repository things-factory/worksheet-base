"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const warehouse_base_1 = require("@things-factory/warehouse-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
exports.transfer = {
    async transfer(_, { palletId, toPalletId, qty }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            // 1. get to inventory
            let toInventory = await trxMgr.getRepository(warehouse_base_1.Inventory).findOne({
                where: { domain: context.state.domain, palletId: toPalletId },
                relations: ['bizplace', 'product', 'warehouse', 'location']
            });
            if (!toInventory)
                throw new Error(`to pallet doesn't exists`);
            // 2. get from inventory
            let fromInventory = await trxMgr.getRepository(warehouse_base_1.Inventory).findOne({
                where: { domain: context.state.domain, palletId },
                relations: ['bizplace', 'product', 'warehouse', 'location']
            });
            if (!fromInventory)
                throw new Error(`from pallet doesn't exists`);
            if (toInventory.batchId !== fromInventory.batchId)
                throw new Error(`Can't transfer to different batch`);
            // 3. get worksheet & worksheet detail
            const worksheetDetail = await trxMgr.getRepository(entities_1.WorksheetDetail).findOne({
                where: {
                    domain: context.state.domain,
                    targetInventory: fromInventory,
                    status: constants_1.WORKSHEET_STATUS.EXECUTING,
                    type: constants_1.WORKSHEET_TYPE.PUTAWAY
                },
                relations: ['worksheet', 'targetInventory']
            });
            if (!worksheetDetail)
                throw new Error(`Worksheet Detail doesn't exists`);
            const worksheet = worksheetDetail.worksheet;
            if (!worksheet)
                throw new Error(`Worksheet doesn't exists`);
            let targetInventory = worksheetDetail.targetInventory;
            // 4. transfer qty
            // 4. 1) if result < 0
            //    - throw error
            const leftQty = fromInventory.qty - qty;
            if (leftQty < 0)
                throw new Error(`Invalid qty, can't exceed limitation`);
            // 4. 2) if result == 0
            if (leftQty == 0) {
                //    - plus qty to (toInventory)
                await trxMgr.getRepository(warehouse_base_1.Inventory).save(Object.assign(Object.assign({}, toInventory), { qty: toInventory.qty + qty, lastSeq: toInventory.lastSeq + 1, updater: context.state.user }));
                //    - add inventory history
                delete toInventory.id;
                await trxMgr.getRepository(warehouse_base_1.InventoryHistory).save(Object.assign(Object.assign({}, toInventory), { domain: context.state.domain, name: warehouse_base_1.InventoryNoGenerator.inventoryHistoryName(), productId: toInventory.product.id, warehouseId: toInventory.warehouse.id, locationId: toInventory.location.id, seq: toInventory.lastSeq, transactionType: warehouse_base_1.INVENTORY_TRANSACTION_TYPE.TRANSFERED_IN, creator: context.state.user, updater: context.state.user }));
                //    - update (fromInventory)
                await trxMgr.getRepository(warehouse_base_1.Inventory).save(Object.assign(Object.assign({}, fromInventory), { qty: leftQty, status: warehouse_base_1.INVENTORY_STATUS.TERMINATED, lastSeq: fromInventory.lastSeq + 1, updater: context.state.user }));
                await trxMgr.getRepository(sales_base_1.OrderInventory).save(Object.assign(Object.assign({}, targetInventory), { status: sales_base_1.ORDER_PRODUCT_STATUS.TERMINATED }));
                fromInventory = await trxMgr.getRepository(warehouse_base_1.Inventory).findOne({
                    where: { id: fromInventory.id },
                    relations: ['bizplace', 'product', 'warehouse', 'location']
                });
                //    - add inventory history
                await trxMgr.getRepository(warehouse_base_1.InventoryHistory).save(Object.assign(Object.assign({}, fromInventory), { name: warehouse_base_1.InventoryNoGenerator.inventoryHistoryName(), productId: fromInventory.product.id, warehouseId: fromInventory.warehouse.id, locationId: fromInventory.location.id, seq: fromInventory.lastSeq, transactionType: warehouse_base_1.INVENTORY_TRANSACTION_TYPE.TRANSFERED_OUT, creator: context.state.user, updater: context.state.user }));
                //    - update worksheetDetail (EXECUTING => DONE)
                await trxMgr.getRepository(entities_1.WorksheetDetail).save(Object.assign(Object.assign({}, worksheetDetail), { status: constants_1.WORKSHEET_STATUS.DONE, updater: context.state.user }));
            }
            // 4. 3) if result > 0
            else if (leftQty > 0) {
                await trxMgr.getRepository(warehouse_base_1.Inventory).save(Object.assign(Object.assign({}, toInventory), { qty: toInventory.qty + qty, lastSeq: toInventory.lastSeq + 1, updater: context.state.user }));
                toInventory = await trxMgr.getRepository(warehouse_base_1.Inventory).findOne({
                    where: { id: toInventory.id },
                    relations: ['bizplace', 'product', 'warehouse', 'location']
                });
                //    - add inventory history
                delete toInventory.id;
                await trxMgr.getRepository(warehouse_base_1.InventoryHistory).save(Object.assign(Object.assign({}, toInventory), { domain: context.state.domain, name: warehouse_base_1.InventoryNoGenerator.inventoryHistoryName(), productId: toInventory.product.id, warehouseId: toInventory.warehouse.id, locationId: toInventory.location.id, seq: toInventory.lastSeq, transactionType: warehouse_base_1.INVENTORY_TRANSACTION_TYPE.TRANSFERED_IN, creator: context.state.user, updater: context.state.user }));
                await trxMgr.getRepository(warehouse_base_1.Inventory).save(Object.assign(Object.assign({}, fromInventory), { qty: leftQty, lastSeq: fromInventory.lastSeq + 1, updater: context.state.user }));
                fromInventory = await trxMgr.getRepository(warehouse_base_1.Inventory).findOne({
                    where: { id: fromInventory.id },
                    relations: ['bizplace', 'product', 'warehouse', 'location']
                });
                //    - add inventory history
                await trxMgr.getRepository(warehouse_base_1.InventoryHistory).save(Object.assign(Object.assign({}, fromInventory), { name: warehouse_base_1.InventoryNoGenerator.inventoryHistoryName(), productId: fromInventory.product.id, warehouseId: fromInventory.warehouse.id, locationId: fromInventory.location.id, seq: fromInventory.lastSeq, transactionType: warehouse_base_1.INVENTORY_TRANSACTION_TYPE.TRANSFERED_OUT, creator: context.state.user, updater: context.state.user }));
            }
        });
    }
};
//# sourceMappingURL=transfer.js.map