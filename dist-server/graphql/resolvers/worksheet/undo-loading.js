"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const warehouse_base_1 = require("@things-factory/warehouse-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
const utils_1 = require("../../../utils");
exports.undoLoading = {
    async undoLoading(_, { deliveryOrder, palletIds }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            var _a;
            if (!((_a = deliveryOrder) === null || _a === void 0 ? void 0 : _a.id))
                throw new Error(`There's no delivery order id`);
            const foundDO = await trxMgr.getRepository(sales_base_1.DeliveryOrder).findOne({
                where: { id: deliveryOrder.id },
                relations: ['bizplace', 'releaseGood']
            });
            const customerBizplace = foundDO.bizplace;
            // 1. Find target inventories based on delivery order and status
            let targetInventories = await trxMgr.getRepository(sales_base_1.OrderInventory).find({
                where: {
                    domain: context.state.domain,
                    bizplace: customerBizplace,
                    deliveryOrder: foundDO,
                    status: sales_base_1.ORDER_INVENTORY_STATUS.LOADED
                },
                relations: ['inventory', 'releaseGood']
            });
            // 2. Filter out inventories which is included palletIds list.
            targetInventories = targetInventories
                .filter((targetInv) => palletIds.includes(targetInv.inventory.palletId))
                .map((targetInv) => {
                return Object.assign(Object.assign({}, targetInv), { deliveryOrder: null, status: sales_base_1.ORDER_INVENTORY_STATUS.LOADING, updater: context.state.user });
            });
            // 3. Remove relation with Delivery Order
            await trxMgr.getRepository(sales_base_1.OrderInventory).save(targetInventories);
            // 4. Check whethere there's more order inventories which is related with foundDO
            // 4. 1) If there's no more order inventories which is related with foundDO
            //       Remove delivery order
            const remainTargetInv = await trxMgr.getRepository(sales_base_1.OrderInventory).count({
                where: {
                    deliveryOrder: foundDO
                }
            });
            if (!remainTargetInv)
                await trxMgr.getRepository(sales_base_1.DeliveryOrder).delete(foundDO.id);
            // 5. If there was remained items => Merge into previous order inventories
            await Promise.all(targetInventories.map(async (targetInv) => {
                const prevTargetInv = await trxMgr.getRepository(sales_base_1.OrderInventory).findOne({
                    where: {
                        id: typeorm_1.Not(typeorm_1.Equal(targetInv.id)),
                        releaseGood: targetInv.releaseGood,
                        status: sales_base_1.ORDER_INVENTORY_STATUS.LOADING,
                        inventory: targetInv.inventory
                    }
                });
                if (prevTargetInv) {
                    await trxMgr.getRepository(sales_base_1.OrderInventory).save(Object.assign(Object.assign({}, prevTargetInv), { releaseQty: targetInv.releaseQty + prevTargetInv.releaseQty, releaseWeight: targetInv.releaseWeight + prevTargetInv.releaseWeight, updater: context.state.user }));
                }
                // 6. Create Inventory Hisotry
                let inventory = targetInv.inventory;
                inventory = await trxMgr.getRepository(warehouse_base_1.Inventory).findOne({
                    where: { id: inventory.id },
                    relations: ['bizplace', 'product', 'warehouse', 'location']
                });
                await utils_1.generateInventoryHistory(inventory, foundDO.releaseGood, warehouse_base_1.INVENTORY_TRANSACTION_TYPE.UNDO_LOADING, 0, 0, context.state.user);
                // 7. If targetInv is merged into previous target inventory
                //    TERMINATE order inventory
                //    else
                //    Save order inventory
                if (prevTargetInv) {
                    await trxMgr.getRepository(sales_base_1.OrderInventory).save(Object.assign(Object.assign({}, targetInv), { status: sales_base_1.ORDER_INVENTORY_STATUS.TERMINATED, updater: context.state.user }));
                    await trxMgr.getRepository(entities_1.WorksheetDetail).delete({
                        targetInventory: targetInv.id,
                        type: constants_1.WORKSHEET_TYPE.LOADING,
                        status: constants_1.WORKSHEET_STATUS.DONE
                    });
                }
                else {
                    await trxMgr.getRepository(sales_base_1.OrderInventory).save(targetInv);
                    const worksheetDetail = await trxMgr.getRepository(entities_1.WorksheetDetail).findOne({
                        where: {
                            targetInventory: targetInv,
                            type: constants_1.WORKSHEET_TYPE.LOADING,
                            status: constants_1.WORKSHEET_STATUS.DONE
                        }
                    });
                    await trxMgr.getRepository(entities_1.WorksheetDetail).save(Object.assign(Object.assign({}, worksheetDetail), { status: constants_1.WORKSHEET_STATUS.EXECUTING, updater: context.state.user }));
                }
            }));
        });
    }
};
//# sourceMappingURL=undo-loading.js.map