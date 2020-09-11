"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const warehouse_base_1 = require("@things-factory/warehouse-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
const utils_1 = require("../../../utils");
exports.cycleCountAdjustment = {
    async cycleCountAdjustment(_, { cycleCountNo, cycleCountWorksheetDetails }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            // get cycle count no
            const foundCC = await trxMgr.getRepository(sales_base_1.InventoryCheck).findOne({
                where: {
                    domain: context.state.domain,
                    name: cycleCountNo,
                    status: sales_base_1.ORDER_STATUS.PENDING_REVIEW
                }
            });
            // get cycle count wsd that is not tally
            const foundWSD = await trxMgr.getRepository(entities_1.WorksheetDetail).find({
                where: {
                    domain: context.state.domain,
                    name: typeorm_1.In(cycleCountWorksheetDetails.map(wsd => wsd.name)),
                    status: constants_1.WORKSHEET_STATUS.NOT_TALLY
                },
                relations: [
                    'targetInventory',
                    'targetInventory.inventory',
                    'targetInventory.inventory.location',
                    'targetInventory.inspectedLocation'
                ]
            });
            // get order inventory
            await Promise.all(foundWSD.map(async (wsd) => {
                const foundOI = wsd.targetInventory;
                const inventory = foundOI.inventory;
                const transactQty = foundOI.inspectedQty - inventory.qty;
                const transactWeight = foundOI.inspectedWeight - inventory.weight;
                const foundInspectedLoc = await trxMgr.getRepository(warehouse_base_1.Location).findOne({
                    where: { domain: context.state.domain, name: foundOI.inspectedLocation.name },
                    relations: ['warehouse']
                });
                const foundWarehouse = foundInspectedLoc.warehouse;
                // new allocated location
                const allocatedItemCnt = await trxMgr.getRepository(warehouse_base_1.Inventory).count({
                    domain: context.state.domain,
                    status: warehouse_base_1.INVENTORY_STATUS.STORED,
                    location: foundInspectedLoc
                });
                // previous allocated location
                const prevLocItemCnt = await trxMgr.getRepository(warehouse_base_1.Inventory).count({
                    domain: context.state.domain,
                    status: warehouse_base_1.INVENTORY_STATUS.STORED,
                    location: inventory.location
                });
                if (foundOI.inspectedQty == 0) {
                    // create inventory history
                    await utils_1.generateInventoryHistory(inventory, foundCC, warehouse_base_1.INVENTORY_TRANSACTION_TYPE.ADJUSTMENT, transactQty, transactWeight, context.state.user, trxMgr);
                    // change inventory qty to 0 and terminate it
                    const terminatedInv = await trxMgr.getRepository(warehouse_base_1.Inventory).save(Object.assign(Object.assign({}, inventory), { qty: foundOI.inspectedQty, lockedQty: 0, weight: foundOI.inspectedWeight, lockedWeight: 0, location: foundInspectedLoc, status: warehouse_base_1.INVENTORY_STATUS.TERMINATED, updater: context.state.user }));
                    // create inventory history
                    await utils_1.generateInventoryHistory(terminatedInv, foundCC, warehouse_base_1.INVENTORY_TRANSACTION_TYPE.TERMINATED, 0, 0, context.state.user, trxMgr);
                }
                else {
                    if (inventory.location.name !== foundInspectedLoc.name) {
                        if (!prevLocItemCnt) {
                            // if no inventory at previous location, set status to empty
                            await utils_1.switchLocationStatus(context.state.domain, inventory.location, context.state.user, trxMgr);
                        }
                        if (!allocatedItemCnt) {
                            // if no inventory, set status to stored
                            await utils_1.switchLocationStatus(context.state.domain, foundInspectedLoc, context.state.user, trxMgr);
                        }
                    }
                    // change inventory qty
                    const adjustedInv = await trxMgr.getRepository(warehouse_base_1.Inventory).save(Object.assign(Object.assign({}, inventory), { qty: foundOI.inspectedQty, lockedQty: 0, weight: foundOI.inspectedWeight, lockedWeight: 0, location: foundInspectedLoc, warehouse: foundWarehouse, updater: context.state.user }));
                    // create inv history
                    await utils_1.generateInventoryHistory(adjustedInv, foundCC, warehouse_base_1.INVENTORY_TRANSACTION_TYPE.ADJUSTMENT, transactQty, transactWeight, context.state.user, trxMgr);
                }
                await trxMgr.getRepository(sales_base_1.OrderInventory).save(Object.assign(Object.assign({}, foundOI), { status: sales_base_1.ORDER_INVENTORY_STATUS.TERMINATED, updater: context.state.user }));
                await trxMgr.getRepository(entities_1.WorksheetDetail).save(Object.assign(Object.assign({}, wsd), { status: constants_1.WORKSHEET_STATUS.ADJUSTED, updater: context.state.user }));
            }));
            // change cycle count status to DONE
            await trxMgr.getRepository(sales_base_1.InventoryCheck).save(Object.assign(Object.assign({}, foundCC), { status: sales_base_1.ORDER_STATUS.DONE, updater: context.state.user }));
            return;
        });
    }
};
//# sourceMappingURL=cycle-count-adjustment.js.map