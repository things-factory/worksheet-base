"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const typeorm_1 = require("typeorm");
const sales_base_1 = require("@things-factory/sales-base");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
exports.rejectCancellationReleaseOrder = {
    async rejectCancellationReleaseOrder(_, { name }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            var _a, _b, _c, _d;
            let foundRO = await trxMgr.getRepository(sales_base_1.ReleaseGood).findOne({
                where: { domain: context.state.domain, name, status: sales_base_1.ORDER_STATUS.PENDING_CANCEL },
                relations: [
                    'bizplace',
                    'orderInventories',
                    'orderInventories.inventory',
                    'orderInventories.inventory.location',
                    'orderInventories.deliveryOrder',
                    'orderVass'
                ]
            });
            if (!foundRO)
                throw new Error(`Release order doesn't exists.`);
            let targetOIs = foundRO.orderInventories;
            let foundOVs = foundRO.orderVass;
            let isDeactivatedPicking = false;
            // get the worksheet based on RO number
            let foundWS = await trxMgr.getRepository(entities_1.Worksheet).find({
                where: {
                    domain: context.state.domain,
                    releaseGood: foundRO
                }
            });
            // check worksheet table if started_at is not null to indicate that the worksheet has been activated 
            if (foundWS && ((_a = foundWS) === null || _a === void 0 ? void 0 : _a.length)) {
                foundWS = foundWS.map((ws) => {
                    if (ws.startedAt && !ws.endedAt) {
                        return Object.assign(Object.assign({}, ws), { status: constants_1.WORKSHEET_STATUS.EXECUTING, updater: context.state.user });
                    }
                    else if (ws.startedAt && ws.endedAt) {
                        return Object.assign(Object.assign({}, ws), { status: constants_1.WORKSHEET_STATUS.DONE, updater: context.state.user });
                    }
                    else if (!ws.startedAt && !ws.endedAt && ws.type === constants_1.WORKSHEET_TYPE.PICKING) {
                        isDeactivatedPicking = true;
                        return Object.assign(Object.assign({}, ws), { status: constants_1.WORKSHEET_STATUS.DEACTIVATED, updater: context.state.user });
                    }
                });
                await trxMgr.getRepository(entities_1.Worksheet).save(foundWS);
            }
            // check if the worksheet is in Loading stage
            const isLoadingStage = foundWS.some((ws) => ws.type === constants_1.WORKSHEET_TYPE.LOADING);
            // change the order inventory status accordingly
            let newOrderInventories = targetOIs.map((oi) => {
                if (isLoadingStage && oi.deliveryOrder && oi.status === sales_base_1.ORDER_INVENTORY_STATUS.PENDING_REVERSE)
                    oi.status = sales_base_1.ORDER_INVENTORY_STATUS.LOADED;
                else if (isLoadingStage && !oi.deliveryOrder && oi.status === sales_base_1.ORDER_INVENTORY_STATUS.PENDING_REVERSE)
                    oi.status = sales_base_1.ORDER_INVENTORY_STATUS.LOADING;
                else if (!isLoadingStage && oi.inventory && isDeactivatedPicking && oi.status === sales_base_1.ORDER_INVENTORY_STATUS.PENDING_CANCEL)
                    oi.status = sales_base_1.ORDER_INVENTORY_STATUS.READY_TO_PICK;
                else if (!isLoadingStage && oi.inventory && !isDeactivatedPicking && oi.status === sales_base_1.ORDER_INVENTORY_STATUS.PENDING_CANCEL)
                    oi.status = sales_base_1.ORDER_INVENTORY_STATUS.PICKING;
                else if (!isLoadingStage && oi.inventory && !isDeactivatedPicking && oi.status === sales_base_1.ORDER_INVENTORY_STATUS.PENDING_REVERSE)
                    oi.status = sales_base_1.ORDER_INVENTORY_STATUS.PICKED;
                else if (!isLoadingStage && !oi.inventory && isDeactivatedPicking && oi.status === sales_base_1.ORDER_INVENTORY_STATUS.PENDING_CANCEL)
                    oi.status = sales_base_1.ORDER_INVENTORY_STATUS.PENDING_SPLIT;
                return Object.assign(Object.assign({}, oi), { updater: context.state.user });
            });
            await trxMgr.getRepository(sales_base_1.OrderInventory).save(newOrderInventories);
            // find the worksheet details based on order inventories
            let foundWSD = await trxMgr.getRepository(entities_1.WorksheetDetail).find({
                where: {
                    domain: context.state.domain,
                    targetInventory: typeorm_1.In(newOrderInventories.map((oi) => oi.id))
                },
                relations: ['targetInventory']
            });
            if (foundWSD && ((_b = foundWSD) === null || _b === void 0 ? void 0 : _b.length)) {
                foundWSD = foundWSD.map((wsd) => {
                    //change the worksheet details status accordingly
                    newOrderInventories.forEach((oi) => {
                        var _a, _b;
                        if (((_a = wsd.targetInventory) === null || _a === void 0 ? void 0 : _a.id) === oi.id && wsd.type === constants_1.WORKSHEET_TYPE.PICKING) {
                            switch (oi.status) {
                                case sales_base_1.ORDER_INVENTORY_STATUS.READY_TO_PICK:
                                    wsd.status = constants_1.WORKSHEET_STATUS.DEACTIVATED;
                                    break;
                                case sales_base_1.ORDER_INVENTORY_STATUS.PICKING:
                                    wsd.status = constants_1.WORKSHEET_STATUS.EXECUTING;
                                    break;
                                case sales_base_1.ORDER_INVENTORY_STATUS.REPLACED:
                                    wsd.status = constants_1.WORKSHEET_STATUS.REPLACED;
                                    break;
                                case sales_base_1.ORDER_INVENTORY_STATUS.PICKED:
                                    wsd.status = constants_1.WORKSHEET_STATUS.DONE;
                                    break;
                                case sales_base_1.ORDER_INVENTORY_STATUS.LOADING:
                                    wsd.status = constants_1.WORKSHEET_STATUS.DONE;
                                    break;
                                case sales_base_1.ORDER_INVENTORY_STATUS.LOADED:
                                    wsd.status = constants_1.WORKSHEET_STATUS.DONE;
                                    break;
                            }
                        }
                        else if (((_b = wsd.targetInventory) === null || _b === void 0 ? void 0 : _b.id) === oi.id && wsd.type === constants_1.WORKSHEET_TYPE.LOADING) {
                            switch (oi.status) {
                                case sales_base_1.ORDER_INVENTORY_STATUS.LOADING:
                                    wsd.status = constants_1.WORKSHEET_STATUS.EXECUTING;
                                    break;
                                case sales_base_1.ORDER_INVENTORY_STATUS.LOADED:
                                    wsd.status = constants_1.WORKSHEET_STATUS.DONE;
                                    break;
                            }
                        }
                    });
                    return Object.assign(Object.assign({}, wsd), { updater: context.state.user });
                });
                await trxMgr.getRepository(entities_1.WorksheetDetail).save(foundWSD);
            }
            if (foundOVs && ((_c = foundOVs) === null || _c === void 0 ? void 0 : _c.length)) {
                // update status of order vass to accordingly
                foundOVs = foundOVs.map((orderVas) => {
                    if (!isLoadingStage)
                        orderVas.status = sales_base_1.ORDER_VAS_STATUS.READY_TO_PROCESS;
                    else
                        orderVas.status = sales_base_1.ORDER_VAS_STATUS.COMPLETED;
                    return Object.assign(Object.assign({}, orderVas), { updater: context.state.user });
                });
                await trxMgr.getRepository(sales_base_1.OrderVas).save(foundOVs);
            }
            // find DO and change status to previous status
            let foundDO = await trxMgr.getRepository(sales_base_1.DeliveryOrder).find({
                where: { domain: context.state.domain, releaseGood: foundRO, status: sales_base_1.ORDER_STATUS.PENDING_CANCEL },
                relations: ['transportVehicle']
            });
            if (foundDO && ((_d = foundDO) === null || _d === void 0 ? void 0 : _d.length)) {
                foundDO = foundDO.map((deliveryOrder) => {
                    return Object.assign(Object.assign({}, deliveryOrder), { status: sales_base_1.ORDER_STATUS.READY_TO_DISPATCH, updater: context.state.user });
                });
                await trxMgr.getRepository(sales_base_1.DeliveryOrder).save(foundDO);
            }
            const isLoadingRO = foundWS.some((ws) => ws.type === constants_1.WORKSHEET_TYPE.LOADING &&
                ws.status === constants_1.WORKSHEET_STATUS.EXECUTING);
            if (isLoadingRO)
                foundRO.status = sales_base_1.ORDER_STATUS.LOADING;
            else {
                var isReadyToLoadRO = foundWS.some((ws) => ws.type === constants_1.WORKSHEET_TYPE.LOADING &&
                    ws.status === constants_1.WORKSHEET_STATUS.DEACTIVATED);
            }
            if (isReadyToLoadRO)
                foundRO.status = sales_base_1.ORDER_STATUS.READY_TO_LOAD;
            else {
                var isPickingRO = foundWS.some((ws) => ws.type === constants_1.WORKSHEET_TYPE.PICKING &&
                    ws.status === constants_1.WORKSHEET_STATUS.EXECUTING);
            }
            if (isPickingRO)
                foundRO.status = sales_base_1.ORDER_STATUS.PICKING;
            else {
                var isReadyToPickRO = foundWS.some((ws) => ws.type === constants_1.WORKSHEET_TYPE.PICKING &&
                    ws.status === constants_1.WORKSHEET_STATUS.DEACTIVATED);
            }
            if (isReadyToPickRO)
                foundRO.status = sales_base_1.ORDER_STATUS.READY_TO_PICK;
            await trxMgr.getRepository(sales_base_1.ReleaseGood).save(Object.assign(Object.assign({}, foundRO), { updater: context.state.user }));
            return;
        });
    }
};
//# sourceMappingURL=reject-cancellation-release-order.js.map