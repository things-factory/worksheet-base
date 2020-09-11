"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
const warehouse_base_1 = require("@things-factory/warehouse-base");
exports.completeUnloadingPartiallyResolver = {
    async completeUnloadingPartially(_, { arrivalNoticeNo, worksheetDetail }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            const ganRepo = trxMgr.getRepository(sales_base_1.ArrivalNotice);
            const wsRepo = trxMgr.getRepository(entities_1.Worksheet);
            const wsdRepo = trxMgr.getRepository(entities_1.WorksheetDetail);
            const ordProdRepo = trxMgr.getRepository(sales_base_1.OrderProduct);
            const invRepo = trxMgr.getRepository(warehouse_base_1.Inventory);
            /**
             * @description
             * Do validation for arrival notice
             * - whether it's exists
             * - whether it has proper status (PROCESSING)
             */
            const domain = context.state.domain;
            const user = context.state.user;
            const arrivalNotice = await ganRepo.findOne({
                where: { domain, name: arrivalNoticeNo, status: sales_base_1.ORDER_STATUS.PROCESSING },
                relations: ['bizplace', 'orderProducts']
            });
            if (!arrivalNotice)
                throw new Error(`ArrivalNotice doesn't exists.`);
            const bizplace = arrivalNotice.bizplace;
            /**
             * @description
             * Do validation for worksheet
             * - whether it's exists
             * - whether it has proper status (EXECUTING) and type (UNLOADING)
             */
            const foundWS = await wsRepo.findOne({
                where: {
                    domain,
                    bizplace,
                    arrivalNotice,
                    status: constants_1.WORKSHEET_STATUS.EXECUTING,
                    type: constants_1.WORKSHEET_TYPE.UNLOADING
                },
                relations: ['bufferLocation', 'worksheetDetails', 'worksheetDetails.targetProduct']
            });
            if (!foundWS)
                throw new Error(`Worksheet doesn't exists.`);
            let foundWSD = foundWS.worksheetDetails.find((foundWSD) => foundWSD.name === worksheetDetail.name);
            /**
             * @description
             * Update status and issue if it's exists
             * Althought there's no more remain (packQty === actualPackQty of order product) products,
             * status should be updated to PARTIALLY_UNLOADED
             * Because system can't assume whether there are extra products or not
             */
            if (worksheetDetail.issue)
                foundWSD.issue = worksheetDetail.issue;
            await wsdRepo.save(Object.assign(Object.assign({}, foundWSD), { status: constants_1.WORKSHEET_STATUS.PARTIALLY_UNLOADED, updater: user }));
            let orderProduct = foundWSD.targetProduct;
            orderProduct = await ordProdRepo.save(Object.assign(Object.assign({}, orderProduct), { status: sales_base_1.ORDER_PRODUCT_STATUS.PARTIALLY_UNLOADED, remark: foundWSD.issue || null }));
            /**
             * @description
             * Update status of inventories to PARTIALLY_UNLOADED
             */
            let inventories = await invRepo.find({
                where: {
                    domain,
                    refOrderId: arrivalNotice.id,
                    orderProductId: orderProduct.id,
                    status: warehouse_base_1.INVENTORY_STATUS.UNLOADED
                }
            });
            inventories = inventories.map((inv) => {
                return Object.assign(Object.assign({}, inv), { status: warehouse_base_1.INVENTORY_STATUS.PARTIALLY_UNLOADED, updater: user });
            });
            await invRepo.save(inventories);
        });
    }
};
//# sourceMappingURL=complete-unloading-partially.js.map