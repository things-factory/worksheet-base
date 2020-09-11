"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const warehouse_base_1 = require("@things-factory/warehouse-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
exports.completeInspection = {
    async completeInspection(_, { inventoryCheckNo }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            var _a, _b, _c;
            const inventoryCheck = await trxMgr.getRepository(sales_base_1.InventoryCheck).findOne({
                where: { domain: context.state.domain, name: inventoryCheckNo, status: sales_base_1.ORDER_STATUS.INSPECTING },
                relations: ['bizplace', 'orderInventories']
            });
            if (!inventoryCheck)
                throw new Error(`Inspection order doesn't exists.`);
            const ownDomainBizplace = inventoryCheck.bizplace;
            const foundInspectionWorksheet = await trxMgr.getRepository(entities_1.Worksheet).findOne({
                where: {
                    domain: context.state.domain,
                    bizplace: ownDomainBizplace,
                    status: constants_1.WORKSHEET_STATUS.EXECUTING,
                    type: constants_1.WORKSHEET_TYPE.CYCLE_COUNT,
                    inventoryCheck
                },
                relations: [
                    'worksheetDetails',
                    'worksheetDetails.targetInventory',
                    'worksheetDetails.targetInventory.inventory'
                ]
            });
            if (!foundInspectionWorksheet)
                throw new Error(`Worksheet doesn't exists.`);
            const worksheetDetails = foundInspectionWorksheet.worksheetDetails;
            const targetInventories = worksheetDetails.map((wsd) => wsd.targetInventory);
            // filter out not tally inventory
            const notTallyInv = worksheetDetails.filter((wsd) => wsd.status === constants_1.WORKSHEET_STATUS.NOT_TALLY);
            const tallyOI = targetInventories.filter((oi) => oi.status === sales_base_1.ORDER_INVENTORY_STATUS.INSPECTED);
            if (((_a = tallyOI) === null || _a === void 0 ? void 0 : _a.length) > 0) {
                await Promise.all(tallyOI.map(async (oi) => {
                    const tallyInv = oi.inventory;
                    const terminatedOI = Object.assign(Object.assign({}, oi), { status: sales_base_1.ORDER_INVENTORY_STATUS.TERMINATED, updater: context.state.user });
                    await trxMgr.getRepository(sales_base_1.OrderInventory).save(terminatedOI);
                    await trxMgr.getRepository(warehouse_base_1.Inventory).save(Object.assign(Object.assign({}, tallyInv), { lockedQty: 0, lockedWeight: 0, updater: context.state.user }));
                }));
            }
            if (((_b = notTallyInv) === null || _b === void 0 ? void 0 : _b.length) == 0) {
                // terminate all order inventory if all inspection accuracy is 100%
                await Promise.all(targetInventories.map(async (oi) => {
                    const allTerminatedOI = Object.assign(Object.assign({}, oi), { status: sales_base_1.ORDER_INVENTORY_STATUS.TERMINATED, updater: context.state.user });
                    await trxMgr.getRepository(sales_base_1.OrderInventory).save(allTerminatedOI);
                }));
            }
            // Update status and endedAt of worksheet
            await trxMgr.getRepository(entities_1.Worksheet).save(Object.assign(Object.assign({}, foundInspectionWorksheet), { status: constants_1.WORKSHEET_STATUS.DONE, endedAt: new Date(), updater: context.state.user }));
            if (((_c = notTallyInv) === null || _c === void 0 ? void 0 : _c.length) > 0) {
                // 3. update status of inventory check
                await trxMgr.getRepository(sales_base_1.InventoryCheck).save(Object.assign(Object.assign({}, inventoryCheck), { status: sales_base_1.ORDER_STATUS.PENDING_REVIEW, updater: context.state.user }));
            }
            else {
                // 3. update status of inventory check
                await trxMgr.getRepository(sales_base_1.InventoryCheck).save(Object.assign(Object.assign({}, inventoryCheck), { status: sales_base_1.ORDER_STATUS.DONE, updater: context.state.user }));
            }
            // TODO: Add notification to admin and office admin
        });
    }
};
//# sourceMappingURL=complete-inspection.js.map