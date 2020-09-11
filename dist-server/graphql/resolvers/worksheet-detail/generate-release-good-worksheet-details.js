"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const product_base_1 = require("@things-factory/product-base");
const sales_base_1 = require("@things-factory/sales-base");
const warehouse_base_1 = require("@things-factory/warehouse-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
const utils_1 = require("../../../utils");
exports.generateReleaseGoodWorksheetDetailsResolver = {
    async generateReleaseGoodWorksheetDetails(_, { worksheetNo, batchId, productId, packingType, worksheetDetails }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            var _a;
            // 1. Remove prev worksheet details if it's exists
            const worksheet = await trxMgr.getRepository(entities_1.Worksheet).findOne({
                where: { name: worksheetNo, domain: context.state.domain },
                relations: [
                    'bizplace',
                    'releaseGood',
                    'worksheetDetails',
                    'worksheetDetails.targetInventory',
                    'worksheetDetails.targetInventory.product'
                ]
            });
            const prevWSDs = worksheet.worksheetDetails.filter((wsd) => {
                const targetInv = wsd.targetInventory;
                if (targetInv.batchId === batchId &&
                    targetInv.product.id === productId &&
                    targetInv.packingType === packingType)
                    return wsd.id;
            });
            // TODO: Delete order inventories
            if ((_a = prevWSDs) === null || _a === void 0 ? void 0 : _a.length) {
                const wsdIds = prevWSDs.map((wsd) => wsd.id);
                const prevOrderInvIds = prevWSDs.map((wsd) => wsd.targetInventory.id);
                await trxMgr.getRepository(entities_1.WorksheetDetail).delete(wsdIds);
                await trxMgr.getRepository(sales_base_1.OrderInventory).delete(prevOrderInvIds);
            }
            await Promise.all(worksheetDetails.map(async (wsd) => {
                // 2. Create order inventory
                let targetInventory = wsd.targetInventory;
                const inventory = await trxMgr.getRepository(warehouse_base_1.Inventory).findOne(targetInventory.inventory.id);
                targetInventory = await trxMgr.getRepository(sales_base_1.OrderInventory).save(Object.assign(Object.assign({}, targetInventory), { domain: context.state.domain, bizplace: worksheet.bizplace, name: sales_base_1.OrderNoGenerator.orderInventory(), releaseGood: worksheet.releaseGood, inventory,
                    batchId, status: sales_base_1.ORDER_INVENTORY_STATUS.READY_TO_PICK, product: await trxMgr.getRepository(product_base_1.Product).findOne(productId), packingType, creator: context.state.user, updater: context.state.user }));
                const currentLockedQty = inventory.lockedQty;
                const currentLockedWeight = inventory.lockedWeight;
                await trxMgr.getRepository(warehouse_base_1.Inventory).save(Object.assign(Object.assign({}, targetInventory.inventory), { lockedQty: Boolean(currentLockedQty)
                        ? targetInventory.releaseQty + currentLockedQty
                        : targetInventory.releaseQty, lockedWeight: Boolean(currentLockedWeight)
                        ? targetInventory.releaseWeight + currentLockedWeight
                        : targetInventory.releaseWeight, updater: context.state.user }));
                // 3. Create worksheet details
                await trxMgr.getRepository(entities_1.WorksheetDetail).save(Object.assign(Object.assign({}, wsd), { domain: context.state.domain, bizplace: worksheet.bizplace, worksheet, name: utils_1.WorksheetNoGenerator.pickingDetail(), targetInventory, type: constants_1.WORKSHEET_TYPE.PICKING, status: constants_1.WORKSHEET_STATUS.DEACTIVATED, creator: context.state.user, updater: context.state.user }));
            }));
        });
    }
};
//# sourceMappingURL=generate-release-good-worksheet-details.js.map