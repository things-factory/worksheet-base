"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
exports.activateCycleCount = {
    async activateCycleCount(_, { worksheetNo }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            /**
             * 1. Validation for worksheet
             *    - data existing
             *    - status of worksheet
             */
            const foundWorksheet = await trxMgr.getRepository(entities_1.Worksheet).findOne({
                where: {
                    domain: context.state.domain,
                    name: worksheetNo,
                    type: constants_1.WORKSHEET_TYPE.CYCLE_COUNT,
                    status: constants_1.WORKSHEET_STATUS.DEACTIVATED
                },
                relations: ['bizplace', 'inventoryCheck', 'worksheetDetails', 'worksheetDetails.targetInventory']
            });
            if (!foundWorksheet)
                throw new Error(`Worksheet doesn't exists`);
            let foundWSDs = foundWorksheet.worksheetDetails;
            let targetInventories = foundWSDs.map((foundWSD) => foundWSD.targetInventory);
            /**
             * 2. Update status of picking worksheet details (status: DEACTIVATED => EXECUTING)
             */
            foundWSDs = foundWSDs.map((wsd) => {
                return Object.assign(Object.assign({}, wsd), { status: constants_1.WORKSHEET_STATUS.EXECUTING, updater: context.state.user });
            });
            await trxMgr.getRepository(entities_1.WorksheetDetail).save(foundWSDs);
            /**
             * 3. Update target inventories (status: PENDING => INSPECTING)
             */
            targetInventories = targetInventories.map((ordInv) => {
                return Object.assign(Object.assign({}, ordInv), { status: sales_base_1.ORDER_INVENTORY_STATUS.INSPECTING, updater: context.state.user });
            });
            await trxMgr.getRepository(sales_base_1.OrderInventory).save(targetInventories);
            /**
             * 4. Update cycle count Worksheet (status: DEACTIVATED => EXECUTING)
             */
            const worksheet = await trxMgr.getRepository(entities_1.Worksheet).save(Object.assign(Object.assign({}, foundWorksheet), { status: constants_1.WORKSHEET_STATUS.EXECUTING, startedAt: new Date(), updater: context.state.user }));
            /**
             * 5. Update Inventory check order (status: PENDING => INSPECTING)
             */
            const cycleCount = foundWorksheet.inventoryCheck;
            await trxMgr.getRepository(sales_base_1.InventoryCheck).save(Object.assign(Object.assign({}, cycleCount), { status: sales_base_1.ORDER_STATUS.INSPECTING, updater: context.state.user }));
            return worksheet;
        });
    }
};
//# sourceMappingURL=activate-cycle-count.js.map