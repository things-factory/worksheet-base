"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
exports.undoInspection = {
    async undoInspection(_, { worksheetDetailName }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            // 1. update status of worksheetDetail (DONE => EXECUTING)
            const foundWorksheetDetail = await trxMgr.getRepository(entities_1.WorksheetDetail).findOne({
                where: { domain: context.state.domain, name: worksheetDetailName, status: typeorm_1.Not(constants_1.WORKSHEET_STATUS.EXECUTING) },
                relations: [
                    'worksheet',
                    'worksheet.inventoryCheck',
                    'bizplace',
                    'fromLocation',
                    'toLocation',
                    'targetInventory'
                ]
            });
            if (!foundWorksheetDetail)
                throw new Error("Worksheet doesn't exists");
            const targetInventory = foundWorksheetDetail.targetInventory;
            await trxMgr.getRepository(sales_base_1.OrderInventory).save(Object.assign(Object.assign({}, targetInventory), { inspectedLocation: null, inspectedQty: null, inspectedWeight: null, status: sales_base_1.ORDER_INVENTORY_STATUS.INSPECTING, updater: context.state.user }));
            await trxMgr.getRepository(entities_1.WorksheetDetail).save(Object.assign(Object.assign({}, foundWorksheetDetail), { status: constants_1.WORKSHEET_STATUS.EXECUTING }));
        });
    }
};
//# sourceMappingURL=undo-inspection.js.map