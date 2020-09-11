"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const auth_base_1 = require("@things-factory/auth-base");
const shell_1 = require("@things-factory/shell");
const typeorm_1 = require("typeorm");
const sales_base_1 = require("@things-factory/sales-base");
const entities_1 = require("../../../entities");
exports.pendingCancellationReleaseOrder = {
    async pendingCancellationReleaseOrder(_, { name }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            var _a;
            const foundRO = await trxMgr.getRepository(sales_base_1.ReleaseGood).findOne({
                where: { domain: context.state.domain, name },
                relations: ['bizplace', 'orderInventories', 'orderVass'],
            });
            if (!foundRO)
                throw new Error(`Release good order doesn't exists.`);
            let targetOIs = foundRO.orderInventories;
            let foundOVs = foundRO.orderVass;
            let customerBizplace = foundRO.bizplace;
            let pickedOIs;
            let pickingOIs;
            // 1. Check RO status
            if (foundRO.status === sales_base_1.ORDER_STATUS.DONE || foundRO.status === sales_base_1.ORDER_STATUS.LOADING) {
                // 1a. Case 1: RO is done or loading, pending cancel order, worksheet, worksheet detail, order inventory
                // update status of order inventory to PENDING_CANCEL
                pickedOIs = targetOIs.map((orderInv) => {
                    return Object.assign(Object.assign({}, orderInv), { status: sales_base_1.ORDER_INVENTORY_STATUS.PENDING_REVERSE, updater: context.state.user });
                });
                await trxMgr.getRepository(sales_base_1.OrderInventory).save(pickedOIs);
            }
            else if (foundRO.status === sales_base_1.ORDER_STATUS.PICKING || foundRO.status === sales_base_1.ORDER_STATUS.READY_TO_PICK) {
                pickingOIs = targetOIs
                    .filter((oi) => oi.status === sales_base_1.ORDER_INVENTORY_STATUS.PICKING ||
                    oi.status === sales_base_1.ORDER_INVENTORY_STATUS.READY_TO_PICK ||
                    oi.status === sales_base_1.ORDER_INVENTORY_STATUS.PENDING_SPLIT)
                    .map((targetOI) => {
                    return Object.assign(Object.assign({}, targetOI), { status: sales_base_1.ORDER_INVENTORY_STATUS.PENDING_CANCEL, updater: context.state.user });
                });
                await trxMgr.getRepository(sales_base_1.OrderInventory).save(pickingOIs);
                pickedOIs = targetOIs
                    .filter((pickedOI) => pickedOI.status === sales_base_1.ORDER_INVENTORY_STATUS.PICKED)
                    .map((targetOI) => {
                    return Object.assign(Object.assign({}, targetOI), { status: sales_base_1.ORDER_INVENTORY_STATUS.PENDING_REVERSE, updater: context.state.user });
                });
                await trxMgr.getRepository(sales_base_1.OrderInventory).save(pickedOIs);
            }
            // update status of order vass to PENDING_CANCEL
            if (foundOVs && foundOVs.length) {
                foundOVs = foundOVs.map((orderVas) => {
                    return Object.assign(Object.assign({}, orderVas), { status: sales_base_1.ORDER_VAS_STATUS.PENDING_CANCEL, updater: context.state.user });
                });
                await trxMgr.getRepository(sales_base_1.OrderVas).save(foundOVs);
            }
            if (pickedOIs && pickedOIs.length) {
                let pickedWSD = await trxMgr.getRepository(entities_1.WorksheetDetail).find({
                    where: {
                        domain: context.state.domain,
                        targetInventory: typeorm_1.In(pickedOIs.map((oi) => oi.id)),
                        status: sales_base_1.ORDER_INVENTORY_STATUS.DONE,
                    },
                });
                pickedWSD = pickedWSD.map((wsd) => {
                    return Object.assign(Object.assign({}, wsd), { status: sales_base_1.ORDER_INVENTORY_STATUS.PENDING_CANCEL, updater: context.state.user });
                });
                await trxMgr.getRepository(entities_1.WorksheetDetail).save(pickedWSD);
                let replacedWSD = await trxMgr.getRepository(entities_1.WorksheetDetail).find({
                    where: {
                        domain: context.state.domain,
                        targetInventory: typeorm_1.In(pickedOIs.map((oi) => oi.id)),
                        status: sales_base_1.ORDER_INVENTORY_STATUS.REPLACED,
                    },
                    relations: ['targetInventory'],
                });
                if (replacedWSD && replacedWSD.length) {
                    let replacedOI = replacedWSD.map((wsd) => wsd.targetInventory);
                    replacedOI = replacedOI.map((oi) => {
                        return Object.assign(Object.assign({}, oi), { status: sales_base_1.ORDER_INVENTORY_STATUS.REPLACED, updater: context.state.user });
                    });
                    await trxMgr.getRepository(sales_base_1.OrderInventory).save(replacedOI);
                }
            }
            if (pickingOIs && pickingOIs.length) {
                let pickingWSD = await trxMgr.getRepository(entities_1.WorksheetDetail).find({
                    where: { domain: context.state.domain, targetInventory: typeorm_1.In(pickingOIs.map((oi) => oi.id)) },
                });
                pickingWSD = pickingWSD.map((wsd) => {
                    return Object.assign(Object.assign({}, wsd), { status: sales_base_1.ORDER_INVENTORY_STATUS.PENDING_CANCEL, updater: context.state.user });
                });
                await trxMgr.getRepository(entities_1.WorksheetDetail).save(pickingWSD);
            }
            // find worksheet and update status to PENDING_CANCEL
            let foundWS = await trxMgr.getRepository(entities_1.Worksheet).find({
                where: {
                    domain: context.state.domain,
                    releaseGood: foundRO,
                },
            });
            foundWS = foundWS.map((ws) => {
                return Object.assign(Object.assign({}, ws), { status: sales_base_1.ORDER_INVENTORY_STATUS.PENDING_CANCEL, updater: context.state.user });
            });
            await trxMgr.getRepository(entities_1.Worksheet).save(foundWS);
            // find DO and change status to pending cancel
            let foundDO = await trxMgr.getRepository(sales_base_1.DeliveryOrder).find({
                where: { domain: context.state.domain, releaseGood: foundRO },
            });
            foundDO = foundDO.map((deliveryOrder) => {
                return Object.assign(Object.assign({}, deliveryOrder), { status: sales_base_1.ORDER_STATUS.PENDING_CANCEL, updater: context.state.user });
            });
            await trxMgr.getRepository(sales_base_1.DeliveryOrder).save(foundDO);
            await trxMgr.getRepository(sales_base_1.ReleaseGood).save(Object.assign(Object.assign({}, foundRO), { status: sales_base_1.ORDER_STATUS.PENDING_CANCEL, updater: context.state.user }));
            // notification logics
            // get Office Admin Users
            const users = await trxMgr
                .getRepository('users_roles')
                .createQueryBuilder('ur')
                .select('ur.users_id', 'id')
                .where((qb) => {
                const subQuery = qb
                    .subQuery()
                    .select('role.id')
                    .from(auth_base_1.Role, 'role')
                    .where("role.name = 'Office Admin'")
                    .andWhere('role.domain_id = :domain', { domain: context.state.domain.id })
                    .getQuery();
                return 'ur.roles_id IN ' + subQuery;
            })
                .getRawMany();
            // send notification to Office Admin Users
            if ((_a = users) === null || _a === void 0 ? void 0 : _a.length) {
                const msg = {
                    title: `${foundRO.name} cancellation`,
                    message: `${customerBizplace.name} is requesting to cancel order`,
                    url: context.header.referer,
                };
                users.forEach((user) => {
                    shell_1.sendNotification({
                        receiver: user.id,
                        message: JSON.stringify(msg),
                    });
                });
            }
            return;
        });
    },
};
//# sourceMappingURL=pending-cancellation-release-order.js.map