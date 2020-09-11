"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const warehouse_base_1 = require("@things-factory/warehouse-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
exports.unloadedInventoriesByReusablePallet = {
    async unloadedInventoriesByReusablePallet(_, { reusablePalletId, worksheetDetailName }, context) {
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
        let foundReusablePallet;
        foundReusablePallet = await typeorm_1.getRepository(warehouse_base_1.Pallet).findOne({
            where: {
                domain: context.state.domain,
                name: reusablePalletId
            },
            relations: ['domain']
        });
        let arrivalNotice = foundWorksheetDetail.worksheet.arrivalNotice;
        let customerBizplace = foundWorksheetDetail.bizplace;
        return await typeorm_1.getRepository(warehouse_base_1.Inventory).find({
            where: {
                domain: context.state.domain,
                bizplace: customerBizplace,
                batchId: foundWorksheetDetail.targetProduct.batchId,
                refOrderId: arrivalNotice.id,
                reusablePallet: foundReusablePallet,
                status: warehouse_base_1.INVENTORY_STATUS.UNLOADED
            },
            relations: ['reusablePallet', 'product']
        });
    }
};
//# sourceMappingURL=unloaded-inventories-by-reusable-pallet.js.map