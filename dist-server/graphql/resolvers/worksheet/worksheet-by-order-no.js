"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
exports.worksheetByOrderNoResolver = {
    async worksheetByOrderNo(_, { orderType, orderNo }, context) {
        const domain = context.state.domain;
        return await worksheetByOrderNo(domain, orderNo, orderType);
    }
};
async function worksheetByOrderNo(domain, orderNo, type, trxMgr) {
    var _a, _b, _c;
    let findOption = { where: { domain, type }, relations: ['worksheetDetails'] };
    if (type === constants_1.WORKSHEET_TYPE.UNLOADING || type === constants_1.WORKSHEET_TYPE.PUTAWAY) {
        const ganRepo = ((_a = trxMgr) === null || _a === void 0 ? void 0 : _a.getRepository(sales_base_1.ArrivalNotice)) || typeorm_1.getRepository(sales_base_1.ArrivalNotice);
        findOption.where['arrivalNotice'] = await ganRepo.findOne({ domain, name: orderNo });
        findOption.relations.push('worksheetDetails.targetProduct');
    }
    else if (type === constants_1.WORKSHEET_TYPE.PICKING || type === constants_1.WORKSHEET_TYPE.LOADING) {
        const roRepo = ((_b = trxMgr) === null || _b === void 0 ? void 0 : _b.getRepository(sales_base_1.ReleaseGood)) || typeorm_1.getRepository(sales_base_1.ReleaseGood);
        findOption.where['releaseGood'] = await roRepo.findOne({ domain, name: orderNo });
        findOption.relations.push('worksheetDetails.targetInventory');
    }
    const wsRepo = ((_c = trxMgr) === null || _c === void 0 ? void 0 : _c.getRepository(entities_1.Worksheet)) || typeorm_1.getRepository(entities_1.Worksheet);
    return await wsRepo.findOne(findOption);
}
exports.worksheetByOrderNo = worksheetByOrderNo;
//# sourceMappingURL=worksheet-by-order-no.js.map