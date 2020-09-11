"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
exports.undoPreunload = {
    async undoPreunload(_, { worksheetDetailName }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            // 1. update status of worksheetDetail (DONE => EXECUTING)
            const foundWorksheetDetail = await trxMgr.getRepository(entities_1.WorksheetDetail).findOne({
                where: { domain: context.state.domain, name: worksheetDetailName, status: constants_1.WORKSHEET_STATUS.INSPECTED },
                relations: ['worksheet', 'worksheet.arrivalNotice', 'bizplace', 'targetProduct']
            });
            if (!foundWorksheetDetail)
                throw new Error("Worksheet doesn't exists");
            const targetProduct = foundWorksheetDetail.targetProduct;
            await trxMgr.getRepository(sales_base_1.OrderProduct).save(Object.assign(Object.assign({}, targetProduct), { status: sales_base_1.ORDER_PRODUCT_STATUS.READY_TO_UNLOAD, adjustedPalletQty: null, adjustedBatchId: null, updater: context.state.user }));
            await trxMgr.getRepository(entities_1.WorksheetDetail).save(Object.assign(Object.assign({}, foundWorksheetDetail), { status: constants_1.WORKSHEET_STATUS.DEACTIVATED }));
        });
    }
};
//# sourceMappingURL=undo-preunload.js.map