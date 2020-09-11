"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const warehouse_base_1 = require("@things-factory/warehouse-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
const utils_1 = require("../../../utils");
exports.loading = {
    async loading(_, { loadedWorksheetDetails, releaseGoodNo, orderInfo }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            const releaseGood = await trxMgr.getRepository(sales_base_1.ReleaseGood).findOne({
                where: { domain: context.state.domain, name: releaseGoodNo, status: sales_base_1.ORDER_STATUS.LOADING },
                relations: ['bizplace']
            });
            const wsdNames = loadedWorksheetDetails.map((wsd) => wsd.name);
            const worksheetDetails = await trxMgr.getRepository(entities_1.WorksheetDetail).find({
                where: {
                    domain: context.state.domain,
                    name: typeorm_1.In(wsdNames),
                    status: constants_1.WORKSHEET_STATUS.EXECUTING,
                    type: constants_1.WORKSHEET_TYPE.LOADING
                },
                relations: [
                    'bizplace',
                    'domain',
                    'worksheet',
                    'targetInventory',
                    'targetInventory.domain',
                    'targetInventory.bizplace',
                    'targetInventory.inventory',
                    'targetInventory.inventory.bizplace',
                    'targetInventory.inventory.product',
                    'targetInventory.inventory.warehouse',
                    'targetInventory.inventory.location',
                    'targetInventory.releaseGood'
                ]
            });
            let targetInventories = [];
            if (wsdNames.length !== worksheetDetails.length)
                throw new Error(`Can't find some of worksheet details`);
            for (let i = 0; i < worksheetDetails.length; i++) {
                const wsd = worksheetDetails[i];
                const orderInventory = wsd.targetInventory;
                let inventory = wsd.targetInventory.inventory;
                const pickedQty = orderInventory.releaseQty;
                const loadedQty = loadedWorksheetDetails.find((loadedWSD) => loadedWSD.name === wsd.name).loadedQty;
                if (loadedQty > pickedQty) {
                    throw new Error(`Loaded QTY can't excced Picked QTY`);
                }
                else if (loadedQty == pickedQty) {
                    // 1. Change status of current worksheet detail
                    // 2. Change status of order inventory
                    await trxMgr.getRepository(entities_1.WorksheetDetail).save(Object.assign(Object.assign({}, wsd), { status: constants_1.WORKSHEET_STATUS.DONE, updater: context.state.user }));
                    const targetInventory = await trxMgr.getRepository(sales_base_1.OrderInventory).save(Object.assign(Object.assign({}, orderInventory), { status: sales_base_1.ORDER_INVENTORY_STATUS.LOADED, updater: context.state.user }));
                    targetInventories.push(targetInventory);
                    await utils_1.generateInventoryHistory(inventory, targetInventory.releaseGood, warehouse_base_1.INVENTORY_TRANSACTION_TYPE.LOADING, 0, 0, context.state.user, trxMgr);
                }
                else if (loadedQty < pickedQty) {
                    const remainQty = pickedQty - loadedQty;
                    const loadedWeight = parseFloat(((orderInventory.releaseWeight / pickedQty) * loadedQty).toFixed(2));
                    const remainWeight = parseFloat((orderInventory.releaseWeight - loadedWeight).toFixed(2));
                    const lastSeq = await trxMgr.getRepository(sales_base_1.OrderInventory).count({
                        where: { releaseGood, type: sales_base_1.ORDER_TYPES.RELEASE_OF_GOODS }
                    });
                    const targetInventory = await trxMgr.getRepository(sales_base_1.OrderInventory).save(Object.assign(Object.assign({}, orderInventory), { status: sales_base_1.ORDER_INVENTORY_STATUS.LOADED, releaseQty: loadedQty, releaseWeight: loadedWeight, updater: context.state.user }));
                    await trxMgr.getRepository(entities_1.WorksheetDetail).save(Object.assign(Object.assign({}, wsd), { status: constants_1.WORKSHEET_STATUS.DONE, updater: context.state.user }));
                    targetInventories.push(targetInventory);
                    // Create order inventory for remaining item
                    let remainOrderInv = Object.assign(Object.assign({}, orderInventory), { name: sales_base_1.OrderNoGenerator.orderInventory(), status: sales_base_1.ORDER_INVENTORY_STATUS.LOADING, releaseQty: remainQty, releaseWeight: remainWeight, creator: context.state.user, updater: context.state.user });
                    delete remainOrderInv.id;
                    remainOrderInv = await trxMgr.getRepository(sales_base_1.OrderInventory).save(remainOrderInv);
                    let remainWorksheetDetail = Object.assign(Object.assign({}, wsd), { name: utils_1.WorksheetNoGenerator.loading(), status: constants_1.WORKSHEET_STATUS.EXECUTING, targetInventory: remainOrderInv, creator: context.state.user, updater: context.state.user });
                    delete remainWorksheetDetail.id;
                    await trxMgr.getRepository(entities_1.WorksheetDetail).save(remainWorksheetDetail);
                    await utils_1.generateInventoryHistory(inventory, targetInventory.releaseGood, warehouse_base_1.INVENTORY_TRANSACTION_TYPE.LOADING, 0, 0, context.state.user, trxMgr);
                }
            }
            await sales_base_1.generateDeliveryOrder(orderInfo, targetInventories, releaseGood.bizplace, releaseGood, context.state.domain, context.state.user, trxMgr);
            return;
        });
    }
};
//# sourceMappingURL=loading.js.map