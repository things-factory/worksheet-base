"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const warehouse_base_1 = require("@things-factory/warehouse-base");
const typeorm_1 = require("typeorm");
const entities_1 = require("../../../entities");
const utils_1 = require("../../../utils");
exports.assignVasInventoriesResolver = {
    async assignVasInventories(_, { worksheetDetailIds, inventories }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            const worksheetDetails = await trxMgr.getRepository(entities_1.WorksheetDetail).find({
                where: { id: typeorm_1.In(worksheetDetailIds) },
                relations: [
                    'domain',
                    'bizplace',
                    'worksheet',
                    'targetVas',
                    'targetVas.arrivalNotice',
                    'targetVas.releaseGood',
                    'targetVas.shippingOrder',
                    'targetVas.vasOrder',
                    'targetVas.vas',
                    'targetVas.targetProduct'
                ]
            });
            let seq = 0; // Sequance for VAS order
            for (let worksheetDetail of worksheetDetails) {
                const worksheetDetailId = worksheetDetail.id;
                const orderVas = worksheetDetail.targetVas;
                const prevOrderVasId = orderVas.id;
                const domain = context.state.domain;
                const bizplace = worksheetDetail.bizplace;
                delete worksheetDetail.id;
                for (let inv of inventories) {
                    let targetVas = Object.assign({}, orderVas);
                    delete targetVas.id;
                    const inventory = await trxMgr.getRepository(warehouse_base_1.Inventory).findOne(inv.id);
                    const unitWeight = inventory.weight / inventory.qty;
                    // Create new order vas
                    targetVas = await trxMgr.getRepository(sales_base_1.OrderVas).save(Object.assign(Object.assign({}, targetVas), { domain,
                        bizplace, name: sales_base_1.OrderNoGenerator.orderVas(), qty: inv.qty, weight: inv.qty * unitWeight, inventory, creator: context.state.user, updater: context.state.user }));
                    // Create new worksheet detail
                    await trxMgr.getRepository(entities_1.WorksheetDetail).save(Object.assign(Object.assign({}, worksheetDetail), { domain,
                        bizplace, name: utils_1.WorksheetNoGenerator.vasDetail(), seq,
                        targetVas, creator: context.state.user, updater: context.state.user }));
                    seq++;
                }
                // Delete previous worksheet detail
                await trxMgr.getRepository(entities_1.WorksheetDetail).delete(worksheetDetailId);
                // Delete previous order vas
                await trxMgr.getRepository(sales_base_1.OrderVas).delete(prevOrderVasId);
            }
        });
    }
};
//# sourceMappingURL=assign-vas-inventories.js.map