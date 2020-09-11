"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
exports.preunloadWorksheetResolver = {
    async preunloadWorksheet(_, { arrivalNoticeNo }, context) {
        const arrivalNotice = await typeorm_1.getRepository(sales_base_1.ArrivalNotice).findOne({
            where: { domain: context.state.domain, name: arrivalNoticeNo, status: sales_base_1.ORDER_STATUS.READY_TO_UNLOAD },
            relations: ['bizplace']
        });
        if (!arrivalNotice)
            throw new Error(`Arrival notice dosen't exist.`);
        const customerBizplace = arrivalNotice.bizplace;
        const worksheet = await typeorm_1.getRepository(entities_1.Worksheet).findOne({
            where: {
                domain: context.state.domain,
                arrivalNotice,
                bizplace: customerBizplace,
                type: constants_1.WORKSHEET_TYPE.UNLOADING,
                status: constants_1.WORKSHEET_STATUS.DEACTIVATED
            },
            relations: [
                'bizplace',
                'bufferLocation',
                'bufferLocation.warehouse',
                'arrivalNotice',
                'worksheetDetails',
                'worksheetDetails.targetProduct',
                'worksheetDetails.targetProduct.product',
                'creator',
                'updater'
            ]
        });
        if (!worksheet)
            throw new Error(`Worksheet dosen't exist.`);
        return {
            worksheetInfo: {
                bizplaceName: customerBizplace.name,
                containerNo: arrivalNotice.containerNo,
                bufferLocation: worksheet.bufferLocation.name,
                startedAt: worksheet.startedAt,
                refNo: arrivalNotice.refNo
            },
            worksheetDetailInfos: worksheet.worksheetDetails.map(async (productWSD) => {
                var _a, _b;
                const targetProduct = productWSD.targetProduct;
                return {
                    name: productWSD.name,
                    batchId: targetProduct.batchId,
                    adjustedBatchId: ((_a = targetProduct) === null || _a === void 0 ? void 0 : _a.adjustedBatchId) ? targetProduct.adjustedBatchId : '',
                    product: targetProduct.product,
                    description: productWSD.description,
                    targetName: targetProduct.name,
                    packingType: targetProduct.packingType,
                    palletQty: targetProduct.palletQty,
                    adjustedPalletQty: ((_b = targetProduct) === null || _b === void 0 ? void 0 : _b.adjustedPalletQty) ? targetProduct.adjustedPalletQty : null,
                    packQty: targetProduct.packQty,
                    remark: targetProduct.remark,
                    status: targetProduct.status
                };
            })
        };
    }
};
//# sourceMappingURL=preunload-worksheet.js.map