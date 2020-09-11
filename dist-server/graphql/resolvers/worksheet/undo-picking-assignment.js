"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const warehouse_base_1 = require("@things-factory/warehouse-base");
const typeorm_1 = require("typeorm");
const entities_1 = require("../../../entities");
exports.undoPickingAssigmentResolver = {
    async undoPickingAssigment(_, { worksheetNo, batchId, productId, packingType }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            const worksheet = await trxMgr.getRepository(entities_1.Worksheet).findOne({
                where: { name: worksheetNo, domain: context.state.domain },
                relations: [
                    'bizplace',
                    'releaseGood',
                    'worksheetDetails',
                    'worksheetDetails.targetInventory',
                    'worksheetDetails.targetInventory.product',
                    'worksheetDetails.targetInventory.inventory'
                ]
            });
            const worksheetDetails = worksheet.worksheetDetails.filter((wsd) => {
                var _a;
                return wsd.targetInventory.batchId === batchId &&
                    ((_a = wsd.targetInventory.product) === null || _a === void 0 ? void 0 : _a.id) === productId &&
                    wsd.targetInventory.packingType === packingType;
            });
            const wsdIds = worksheetDetails.map((wsd) => wsd.id);
            const orderInvIds = worksheetDetails.map((wsd) => wsd.targetInventory.id);
            worksheetDetails.map(async (wsd) => {
                var _a, _b, _c;
                let inv = (_a = wsd.targetInventory) === null || _a === void 0 ? void 0 : _a.inventory;
                await trxMgr.getRepository(warehouse_base_1.Inventory).save(Object.assign(Object.assign({}, inv), { lockedQty: inv.lockedQty - ((_b = wsd.targetInventory) === null || _b === void 0 ? void 0 : _b.releaseQty), lockedWeight: inv.lockedWeight - ((_c = wsd.targetInventory) === null || _c === void 0 ? void 0 : _c.releaseWeight) }));
            });
            await trxMgr.getRepository(entities_1.WorksheetDetail).delete(wsdIds);
            await trxMgr.getRepository(sales_base_1.OrderInventory).delete(orderInvIds);
        });
    }
};
//# sourceMappingURL=undo-picking-assignment.js.map