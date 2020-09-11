"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
exports.preunload = {
    async preunload(_, { worksheetDetailName, adjustedBatchId, adjustedPalletQty, palletQty }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            // 1. find worksheet detail
            const foundWorksheetDetail = await trxMgr.getRepository(entities_1.WorksheetDetail).findOne({
                where: {
                    domain: context.state.domain,
                    name: worksheetDetailName,
                    type: constants_1.WORKSHEET_TYPE.UNLOADING
                },
                relations: ['bizplace', 'targetProduct', 'targetProduct.product', 'worksheet']
            });
            if (!foundWorksheetDetail)
                throw new Error(`WorksheetDetail doesn't exists`);
            let _hasPalletQtyDiff = adjustedPalletQty !== palletQty;
            // 2. if there is adjustedBatchId, store into orderproduct adjustedBatchId
            if (adjustedBatchId) {
                await trxMgr.getRepository(sales_base_1.OrderProduct).save(Object.assign(Object.assign({}, foundWorksheetDetail.targetProduct), { adjustedPalletQty: _hasPalletQtyDiff ? adjustedPalletQty : null, adjustedBatchId, status: sales_base_1.ORDER_PRODUCT_STATUS.PENDING_APPROVAL, updater: context.state.user }));
            }
            else {
                await trxMgr.getRepository(sales_base_1.OrderProduct).save(Object.assign(Object.assign({}, foundWorksheetDetail.targetProduct), { adjustedPalletQty: _hasPalletQtyDiff ? adjustedPalletQty : null, status: sales_base_1.ORDER_PRODUCT_STATUS.INSPECTED, updater: context.state.user }));
            }
            await trxMgr.getRepository(entities_1.WorksheetDetail).save(Object.assign(Object.assign({}, foundWorksheetDetail), { status: constants_1.WORKSHEET_STATUS.INSPECTED, updater: context.state.user }));
        });
    }
};
//# sourceMappingURL=preunload.js.map