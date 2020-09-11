"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const utils_1 = require("../../../utils");
exports.unloadingWorksheetResolver = {
    async unloadingWorksheet(_, { arrivalNoticeNo }, context) {
        const arrivalNotice = await typeorm_1.getRepository(sales_base_1.ArrivalNotice).findOne({
            where: { domain: context.state.domain, name: arrivalNoticeNo /*status: ORDER_STATUS.PROCESSING*/ },
            relations: ['bizplace']
        });
        if (!arrivalNotice)
            throw new Error(`Arrival notice dosen't exist.`);
        const customerBizplace = arrivalNotice.bizplace;
        const worksheet = await utils_1.fetchExecutingWorksheet(context.state.domain, customerBizplace, [
            'bizplace',
            'bufferLocation',
            'bufferLocation.warehouse',
            'arrivalNotice',
            'worksheetDetails',
            'worksheetDetails.targetProduct',
            'worksheetDetails.targetProduct.product',
            'creator',
            'updater'
        ], constants_1.WORKSHEET_TYPE.UNLOADING, arrivalNotice);
        return {
            worksheetInfo: {
                bizplaceName: customerBizplace.name,
                containerNo: arrivalNotice.containerNo,
                bufferLocation: worksheet.bufferLocation.name,
                startedAt: worksheet.startedAt,
                refNo: arrivalNotice.refNo
            },
            worksheetDetailInfos: worksheet.worksheetDetails.map(async (productWSD) => {
                const targetProduct = productWSD.targetProduct;
                return {
                    name: productWSD.name,
                    batchId: targetProduct.batchId,
                    product: targetProduct.product,
                    description: productWSD.description,
                    targetName: targetProduct.name,
                    packingType: targetProduct.packingType,
                    palletQty: targetProduct.palletQty,
                    actualPalletQty: targetProduct.actualPalletQty,
                    packQty: targetProduct.packQty,
                    actualPackQty: targetProduct.actualPackQty,
                    remark: targetProduct.remark,
                    issue: productWSD.issue,
                    status: productWSD.status
                };
            })
        };
    }
};
//# sourceMappingURL=unloading-worksheet.js.map