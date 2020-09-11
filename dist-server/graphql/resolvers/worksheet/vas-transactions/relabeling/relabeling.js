"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const warehouse_base_1 = require("@things-factory/warehouse-base");
const typeorm_1 = require("typeorm");
const execute_vas_1 = require("../../execute-vas");
const common_utils_1 = require("../common-utils");
exports.relabelingResolver = {
    async relabeling(_, { worksheetDetailName, fromPalletId, toPalletId, locationName }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            const domain = context.state.domain;
            const user = context.state.user;
            // Find target worksheet detail & target order vas & bizplace
            const wsd = await common_utils_1.getWorksheetDetailByName(trxMgr, domain, worksheetDetailName);
            let { bizplace, targetVas } = wsd;
            // Check whether to pallet id is duplicated or not.
            if (await trxMgr.getRepository(warehouse_base_1.Inventory).count({
                where: { domain, bizplace, palletId: toPalletId, status: typeorm_1.Not(typeorm_1.Equal(warehouse_base_1.INVENTORY_STATUS.TERMINATED)) }
            })) {
                throw new Error(`Pallet (${toPalletId}) is already exists`);
            }
            // Init refOrder
            const { arrivalNotice, releaseGood, vasOrder } = targetVas;
            const refOrder = arrivalNotice || releaseGood || vasOrder || null;
            if (!refOrder)
                throw new Error(`Couldn't find reference order with current order vas`);
            // Assign inventory if specific inventory isn't assigned yet.
            // This case is occured when the VAS order comes with Arrival Notice or Release Good
            if (!targetVas.inventory) {
                targetVas = await common_utils_1.assignInventory(trxMgr, domain, bizplace, user, wsd, refOrder, targetVas, fromPalletId);
            }
            let originInv = targetVas.inventory;
            let operationGuide = JSON.parse(targetVas.operationGuide);
            let operationGuideData = operationGuide.data;
            if (!operationGuideData.relabeledFrom)
                operationGuideData.relabeledFrom = [];
            const palletChanges = operationGuideData.relabeledFrom;
            const { remainQty, remainWeight } = await common_utils_1.getRemainInventoryAmount(trxMgr, refOrder, domain, bizplace, originInv, palletChanges, fromPalletId);
            const unitWeight = remainWeight / remainQty;
            let newPalletChange = {
                fromPalletId,
                toPalletId,
                reducedQty: 0,
                reducedWeight: 0
            };
            if (locationName) {
                newPalletChange.locationName = locationName;
            }
            else {
                originInv = await trxMgr.getRepository(warehouse_base_1.Inventory).findOne(originInv.id, { relations: ['location'] });
                newPalletChange.locationName = originInv.location.name;
            }
            if (remainQty < targetVas.qty) {
                // 남은 수량으로 전체 작업을 처리할 수 없는 경우
                newPalletChange.reducedQty = remainQty;
                newPalletChange.reducedWeight = remainQty * unitWeight;
            }
            else {
                // 남은 수량으로 전체 작업을 처리할 수 있는 경우
                newPalletChange.reducedQty = targetVas.qty;
                newPalletChange.reducedWeight = targetVas.weight;
            }
            palletChanges.push(newPalletChange);
            operationGuide.data.relabeledFrom = palletChanges;
            // Update every order vas to share same operation guide
            await common_utils_1.updateRelatedOrderVas(trxMgr, domain, bizplace, wsd, targetVas, operationGuide, user);
            await execute_vas_1.executeVas(trxMgr, wsd, domain, user);
        });
    }
};
//# sourceMappingURL=relabeling.js.map