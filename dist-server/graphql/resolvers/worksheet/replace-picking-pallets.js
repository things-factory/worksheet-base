"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const warehouse_base_1 = require("@things-factory/warehouse-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
const utils_1 = require("../../../utils");
const picking_1 = require("./picking");
exports.replacePickingPalletsResolver = {
    async replacePickingPallets(_, { worksheetDetailName, inventories, returnLocation }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            const domain = context.state.domain;
            const user = context.state.user;
            const prevWSD = await trxMgr.getRepository(entities_1.WorksheetDetail).findOne({
                where: { domain, name: worksheetDetailName },
                relations: ['bizplace', 'worksheet', 'worksheet.releaseGood', 'targetInventory', 'targetInventory.inventory']
            });
            const prevOrderInv = prevWSD.targetInventory;
            const prevInv = prevOrderInv.inventory;
            const batchId = prevOrderInv.batchId;
            const productName = prevOrderInv.productName;
            const packingType = prevOrderInv.packingType;
            const worksheet = prevWSD.worksheet;
            const releaseGood = worksheet.releaseGood;
            const customerBizplace = prevWSD.bizplace;
            // remove locked qty and locked weight
            await trxMgr.getRepository(warehouse_base_1.Inventory).save(Object.assign(Object.assign({}, prevInv), { lockedQty: 0, lockedWeight: 0, updater: user }));
            // 2. update status of previous order Inventory
            await trxMgr.getRepository(sales_base_1.OrderInventory).save(Object.assign(Object.assign({}, prevOrderInv), { status: sales_base_1.ORDER_INVENTORY_STATUS.REPLACED, updater: user }));
            // 3. update status of prev worksheet detail
            await trxMgr.getRepository(entities_1.WorksheetDetail).save(Object.assign(Object.assign({}, prevWSD), { status: constants_1.WORKSHEET_STATUS.REPLACED, updater: user }));
            await Promise.all(inventories.map(async (inventory) => {
                const foundInv = await trxMgr.getRepository(warehouse_base_1.Inventory).findOne({
                    where: {
                        domain,
                        palletId: inventory.palletId
                    },
                    relations: ['location']
                });
                const unitWeight = foundInv.weight / foundInv.qty;
                // 4. create new order inventories
                const targetInventory = await trxMgr.getRepository(sales_base_1.OrderInventory).save({
                    domain,
                    bizplace: customerBizplace,
                    name: sales_base_1.OrderNoGenerator.orderInventory(),
                    releaseGood,
                    releaseQty: inventory.qty,
                    releaseWeight: unitWeight * inventory.qty,
                    inventory: foundInv,
                    batchId,
                    type: sales_base_1.ORDER_TYPES.RELEASE_OF_GOODS,
                    status: sales_base_1.ORDER_INVENTORY_STATUS.PICKING,
                    productName,
                    packingType,
                    creator: user,
                    updater: user
                });
                // 5. create new worksheet details
                const wsd = await trxMgr.getRepository(entities_1.WorksheetDetail).save({
                    domain,
                    bizplace: customerBizplace,
                    worksheet,
                    name: utils_1.WorksheetNoGenerator.pickingDetail(),
                    targetInventory,
                    type: constants_1.WORKSHEET_TYPE.PICKING,
                    status: constants_1.WORKSHEET_STATUS.EXECUTING,
                    creator: user,
                    updater: user
                });
                // 6. execute picking transaction
                await picking_1.executePicking(wsd.name, inventory.palletId, returnLocation, inventory.qty, domain, user, trxMgr);
            }));
        });
    }
};
//# sourceMappingURL=replace-picking-pallets.js.map