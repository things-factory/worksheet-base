"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const warehouse_base_1 = require("@things-factory/warehouse-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
exports.unloadedInventories = {
    async unloadedInventories(_, { worksheetDetailName }, context) {
        const foundWorksheetDetail = await typeorm_1.getRepository(entities_1.WorksheetDetail).findOne({
            where: {
                domain: context.state.domain,
                name: worksheetDetailName,
                type: constants_1.WORKSHEET_TYPE.UNLOADING,
                status: typeorm_1.In([constants_1.WORKSHEET_STATUS.EXECUTING, constants_1.WORKSHEET_STATUS.PARTIALLY_UNLOADED])
            },
            relations: ['bizplace', 'targetProduct', 'worksheet', 'worksheet.arrivalNotice', 'worksheet.bufferLocation']
        });
        if (!foundWorksheetDetail)
            return [];
        const arrivalNotice = foundWorksheetDetail.worksheet.arrivalNotice;
        const customerBizplace = foundWorksheetDetail.bizplace;
        return await typeorm_1.getRepository(warehouse_base_1.Inventory).find({
            where: {
                domain: context.state.domain,
                bizplace: customerBizplace,
                refOrderId: arrivalNotice.id,
                batchId: foundWorksheetDetail.targetProduct.batchId,
                location: foundWorksheetDetail.worksheet.bufferLocation,
                orderProductId: foundWorksheetDetail.targetProduct.id,
                status: warehouse_base_1.INVENTORY_STATUS.UNLOADED
            },
            relations: ['reusablePallet']
        });
    }
};
//# sourceMappingURL=unloaded-inventories.js.map