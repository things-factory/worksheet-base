"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const typeorm_1 = require("typeorm");
exports.loadedInventories = {
    async loadedInventories(_, { releaseGoodNo }, context) {
        var _a;
        const foundRO = await typeorm_1.getRepository(sales_base_1.ReleaseGood).findOne({
            where: {
                domain: context.state.domain,
                name: releaseGoodNo,
                status: sales_base_1.ORDER_STATUS.LOADING
            },
            relations: ['bizplace']
        });
        if (!foundRO)
            throw new Error('Release order is not found');
        const deliveryOrders = await typeorm_1.getRepository(sales_base_1.DeliveryOrder).find({
            where: { releaseGood: foundRO }
        });
        if ((_a = deliveryOrders) === null || _a === void 0 ? void 0 : _a.length) {
            return await typeorm_1.getRepository(sales_base_1.OrderInventory).find({
                where: {
                    deliveryOrder: typeorm_1.In(deliveryOrders.map((deliveryOrder) => deliveryOrder.id))
                },
                relations: [
                    'inventory',
                    'inventory.product',
                    'deliveryOrder',
                    'deliveryOrder.transportDriver',
                    'deliveryOrder.transportVehicle'
                ]
            });
        }
        else {
            return [];
        }
    }
};
//# sourceMappingURL=loaded-inventories.js.map