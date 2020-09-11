"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const warehouse_base_1 = require("@things-factory/warehouse-base");
const typeorm_1 = require("typeorm");
const sales_base_1 = require("@things-factory/sales-base");
const utils_1 = require("../../../utils");
const entities_1 = require("../../../entities");
exports.confirmCancellationReleaseOrder = {
    async confirmCancellationReleaseOrder(_, { name }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            var _a, _b, _c, _d, _e, _f;
            let foundRO = await trxMgr.getRepository(sales_base_1.ReleaseGood).findOne({
                where: { domain: context.state.domain, name, status: sales_base_1.ORDER_STATUS.PENDING_CANCEL },
                relations: [
                    'bizplace',
                    'orderInventories',
                    'orderInventories.inventory',
                    'orderInventories.inventory.location',
                    'orderVass'
                ]
            });
            if (!foundRO)
                throw new Error(`Release good order doesn't exists.`);
            let targetOIs = foundRO.orderInventories;
            let foundOVs = foundRO.orderVass;
            // 1. Check Order Inventory status
            // 1a. separate into two groups, group 1: pending cancel, group 2: picked
            let cancelOI = targetOIs.filter((oi) => oi.status === sales_base_1.ORDER_INVENTORY_STATUS.PENDING_CANCEL);
            let pickedOI = targetOIs.filter((oi) => oi.status === sales_base_1.ORDER_INVENTORY_STATUS.PENDING_REVERSE);
            let replacedOI = targetOIs.filter((oi) => oi.status === sales_base_1.ORDER_INVENTORY_STATUS.REPLACED);
            if (pickedOI && ((_a = pickedOI) === null || _a === void 0 ? void 0 : _a.length)) {
                await trxMgr.getRepository(sales_base_1.OrderInventory).save(await Promise.all(pickedOI.map(async (oi) => {
                    var _a, _b;
                    let foundInv = oi.inventory;
                    let foundLoc = foundInv.location;
                    let newOrderInv = Object.assign(Object.assign({}, oi), { status: sales_base_1.ORDER_INVENTORY_STATUS.CANCELLED, updater: context.state.user });
                    if ((_b = (_a = oi) === null || _a === void 0 ? void 0 : _a.inventory) === null || _b === void 0 ? void 0 : _b.id) {
                        let inv = await trxMgr.getRepository(warehouse_base_1.Inventory).findOne(oi.inventory.id);
                        inv = Object.assign(Object.assign({}, inv), { qty: foundInv.qty + oi.releaseQty, weight: foundInv.weight + oi.releaseWeight, status: warehouse_base_1.INVENTORY_STATUS.STORED, updater: context.state.user });
                        await trxMgr.getRepository(warehouse_base_1.Inventory).save(inv);
                        await utils_1.generateInventoryHistory(inv, foundRO, warehouse_base_1.INVENTORY_TRANSACTION_TYPE.CANCEL_ORDER, oi.releaseQty, oi.releaseWeight, context.state.user, trxMgr);
                    }
                    // Update status of location
                    if (foundLoc.status === warehouse_base_1.LOCATION_STATUS.EMPTY) {
                        await trxMgr.getRepository(warehouse_base_1.Location).save(Object.assign(Object.assign({}, foundLoc), { status: warehouse_base_1.LOCATION_STATUS.OCCUPIED, updater: context.state.user }));
                    }
                    return newOrderInv;
                })));
            }
            // change status to cancelled for order inventory that has not executed yet
            if (cancelOI && ((_b = cancelOI) === null || _b === void 0 ? void 0 : _b.length)) {
                await trxMgr.getRepository(sales_base_1.OrderInventory).save(await Promise.all(cancelOI.map(async (oi) => {
                    let cancelledInv = oi.inventory;
                    if (cancelledInv) {
                        await trxMgr.getRepository(warehouse_base_1.Inventory).save(Object.assign(Object.assign({}, cancelledInv), { lockedQty: 0, lockedWeight: 0 }));
                        await utils_1.generateInventoryHistory(cancelledInv, foundRO, warehouse_base_1.INVENTORY_TRANSACTION_TYPE.CANCEL_ORDER, 0, 0, context.state.user, trxMgr);
                    }
                    let cancelledOrderInv = Object.assign(Object.assign({}, oi), { status: sales_base_1.ORDER_INVENTORY_STATUS.CANCELLED, updater: context.state.user });
                    return cancelledOrderInv;
                })));
            }
            if (replacedOI && ((_c = replacedOI) === null || _c === void 0 ? void 0 : _c.length)) {
                replacedOI = replacedOI.map((oi) => {
                    return Object.assign(Object.assign({}, oi), { status: sales_base_1.ORDER_INVENTORY_STATUS.CANCELLED, updater: context.state.user });
                });
            }
            if (foundOVs && ((_d = foundOVs) === null || _d === void 0 ? void 0 : _d.length)) {
                // update status of order vass to CANCELLED
                foundOVs = foundOVs.map((orderVas) => {
                    return Object.assign(Object.assign({}, orderVas), { status: sales_base_1.ORDER_VAS_STATUS.CANCELLED, updater: context.state.user });
                });
                await trxMgr.getRepository(sales_base_1.OrderVas).save(foundOVs);
            }
            // find worksheet and update status to CANCELLED
            let foundWS = await trxMgr.getRepository(entities_1.Worksheet).find({
                where: {
                    domain: context.state.domain,
                    releaseGood: foundRO
                }
            });
            foundWS = foundWS.map((ws) => {
                return Object.assign(Object.assign({}, ws), { status: sales_base_1.ORDER_STATUS.CANCELLED, updater: context.state.user });
            });
            await trxMgr.getRepository(entities_1.Worksheet).save(foundWS);
            // find worksheet detail and update status to CANCELLED
            let foundWSD = await trxMgr.getRepository(entities_1.WorksheetDetail).find({
                where: {
                    domain: context.state.domain,
                    targetInventory: typeorm_1.In(targetOIs.map((oi) => oi.id))
                }
            });
            if (foundWSD && ((_e = foundWSD) === null || _e === void 0 ? void 0 : _e.length)) {
                foundWSD = foundWSD.map((wsd) => {
                    return Object.assign(Object.assign({}, wsd), { status: sales_base_1.ORDER_STATUS.CANCELLED, updater: context.state.user });
                });
                await trxMgr.getRepository(entities_1.WorksheetDetail).save(foundWSD);
            }
            // find DO and change status to pending cancel
            let foundDO = await trxMgr.getRepository(sales_base_1.DeliveryOrder).find({
                where: { domain: context.state.domain, releaseGood: foundRO, status: sales_base_1.ORDER_STATUS.PENDING_CANCEL },
                relations: ['transportVehicle']
            });
            if (foundDO && ((_f = foundDO) === null || _f === void 0 ? void 0 : _f.length)) {
                foundDO = foundDO.map((deliveryOrder) => {
                    return Object.assign(Object.assign({}, deliveryOrder), { status: sales_base_1.ORDER_STATUS.CANCELLED, updater: context.state.user });
                });
                await trxMgr.getRepository(sales_base_1.DeliveryOrder).save(foundDO);
            }
            await trxMgr.getRepository(sales_base_1.ReleaseGood).save(Object.assign(Object.assign({}, foundRO), { status: sales_base_1.ORDER_STATUS.CANCELLED, updater: context.state.user }));
            return;
        });
    }
};
//# sourceMappingURL=confirm-cancellation-release-order.js.map