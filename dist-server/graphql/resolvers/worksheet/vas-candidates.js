"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const warehouse_base_1 = require("@things-factory/warehouse-base");
const typeorm_1 = require("typeorm");
const entities_1 = require("../../../entities");
var OrderType;
(function (OrderType) {
    OrderType[OrderType["ArrivalNotice"] = 0] = "ArrivalNotice";
    OrderType[OrderType["ReleaseGood"] = 1] = "ReleaseGood";
    OrderType[OrderType["VasOrder"] = 2] = "VasOrder";
})(OrderType || (OrderType = {}));
exports.vasCandidatesResolver = {
    async vasCandidates(_, { worksheetDetailId }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            const worksheetDetail = await trxMgr.getRepository(entities_1.WorksheetDetail).findOne(worksheetDetailId, {
                relations: [
                    'bizplace',
                    'worksheet',
                    'worksheet.arrivalNotice',
                    'worksheet.releaseGood',
                    'worksheet.vasOrder',
                    'targetVas',
                    'targetVas.targetProduct'
                ]
            });
            const worksheet = worksheetDetail.worksheet;
            if (!worksheet)
                throw new Error(`Can't find worksheet.`);
            const domain = context.state.domain;
            const bizplace = worksheetDetail.bizplace;
            const orderVas = worksheetDetail.targetVas;
            const orderType = worksheet.arrivalNotice
                ? OrderType.ArrivalNotice
                : worksheet.releaseGood
                    ? OrderType.ReleaseGood
                    : OrderType.VasOrder;
            const inventoryCondition = await buildInventoryCondition(trxMgr, domain, bizplace, worksheet, orderType, orderVas);
            let inventories = await trxMgr.getRepository(warehouse_base_1.Inventory).find({
                where: inventoryCondition,
                relations: ['product', 'location']
            });
            /**
             * @description
             * If current worksheet is comes together with release good.
             * VAS order should be done before processing loading.
             * And qty and weight information for target inventories should be originated from orderInventories
             */
            if (orderType === OrderType.ReleaseGood) {
                inventories = await Promise.all(inventories.map(async (inventory) => {
                    const orderInv = await trxMgr.getRepository(sales_base_1.OrderInventory).findOne({
                        where: {
                            domain,
                            bizplace,
                            inventory,
                            releaseGood: worksheet.releaseGood,
                            status: typeorm_1.In([sales_base_1.ORDER_INVENTORY_STATUS.PICKED])
                        }
                    });
                    return Object.assign(Object.assign({}, inventory), { qty: orderInv.releaseQty, weight: orderInv.releaseWeight });
                }));
            }
            return inventories;
        });
    }
};
async function buildInventoryCondition(trxMgr, domain, bizplace, worksheet, orderType, orderVas) {
    var _a;
    let condition = { domain, bizplace };
    if (orderVas.targetBatchId)
        condition.batchId = orderVas.targetBatchId;
    if (orderVas.targetProduct)
        condition.product = orderVas.targetProduct;
    if (orderVas.packingType)
        condition.packingType = orderVas.packingType;
    switch (orderType) {
        case OrderType.ArrivalNotice:
            const orderProducts = await trxMgr.getRepository(sales_base_1.OrderProduct).find({
                where: {
                    domain,
                    bizplace,
                    arrivalNotice: worksheet.arrivalNotice,
                    status: typeorm_1.In([
                        sales_base_1.ORDER_PRODUCT_STATUS.READY_TO_UNLOAD,
                        sales_base_1.ORDER_PRODUCT_STATUS.UNLOADING,
                        sales_base_1.ORDER_PRODUCT_STATUS.PARTIALLY_UNLOADED,
                        sales_base_1.ORDER_PRODUCT_STATUS.UNLOADED,
                        sales_base_1.ORDER_PRODUCT_STATUS.PUTTING_AWAY,
                        sales_base_1.ORDER_PRODUCT_STATUS.STORED
                    ])
                }
            });
            condition.orderProduct = typeorm_1.In(orderProducts.map((ordProd) => ordProd.id));
            condition.status = typeorm_1.In([
                warehouse_base_1.INVENTORY_STATUS.UNLOADED,
                warehouse_base_1.INVENTORY_STATUS.PARTIALLY_UNLOADED,
                warehouse_base_1.INVENTORY_STATUS.PUTTING_AWAY,
                warehouse_base_1.INVENTORY_STATUS.STORED
            ]);
            break;
        case OrderType.ReleaseGood:
            const orderInventories = await trxMgr.getRepository(sales_base_1.OrderInventory).find({
                where: {
                    domain,
                    bizplace,
                    releaseGood: worksheet.releaseGood,
                    status: typeorm_1.In([sales_base_1.ORDER_INVENTORY_STATUS.PICKED])
                },
                relations: ['inventory']
            });
            const inventoryIds = orderInventories.map((ordInv) => ordInv.inventory.id);
            condition.id = ((_a = inventoryIds) === null || _a === void 0 ? void 0 : _a.length) ? typeorm_1.In(inventoryIds) : typeorm_1.In([null]);
            condition.status = typeorm_1.In([warehouse_base_1.INVENTORY_STATUS.PICKED, warehouse_base_1.INVENTORY_STATUS.TERMINATED, warehouse_base_1.INVENTORY_STATUS.STORED]);
            break;
        case OrderType.VasOrder:
            condition.status = typeorm_1.In([warehouse_base_1.INVENTORY_STATUS.STORED]);
    }
    return condition;
}
//# sourceMappingURL=vas-candidates.js.map