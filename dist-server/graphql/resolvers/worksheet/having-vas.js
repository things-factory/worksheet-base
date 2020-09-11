"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
exports.havingVasResolver = {
    async havingVas(_, { orderType, orderNo }, context) {
        return await havingVas(orderType, orderNo, context);
    }
};
async function havingVas(orderType, orderNo, context, trxMgr) {
    var _a, _b, _c;
    const ganRepo = ((_a = trxMgr) === null || _a === void 0 ? void 0 : _a.getRepository(sales_base_1.ArrivalNotice)) || typeorm_1.getRepository(sales_base_1.ArrivalNotice);
    const roRepo = ((_b = trxMgr) === null || _b === void 0 ? void 0 : _b.getRepository(sales_base_1.ReleaseGood)) || typeorm_1.getRepository(sales_base_1.ReleaseGood);
    const wsRepo = ((_c = trxMgr) === null || _c === void 0 ? void 0 : _c.getRepository(entities_1.Worksheet)) || typeorm_1.getRepository(entities_1.Worksheet);
    const domain = context.state.domain;
    const orderFindOptions = {
        where: { domain, name: orderNo }
    };
    let wsFindOptions = {
        where: { domain, type: constants_1.WORKSHEET_TYPE.VAS }
    };
    if (orderType === sales_base_1.ORDER_TYPES.ARRIVAL_NOTICE) {
        const arrivalNotice = await ganRepo.findOne(orderFindOptions);
        if (!arrivalNotice)
            throw new Error(`Failed to find arrival notice with passed order no (${orderNo})`);
        wsFindOptions.where['arrivalNotice'] = arrivalNotice;
    }
    else if (orderType === sales_base_1.ORDER_TYPES.RELEASE_OF_GOODS) {
        const releaseGood = await roRepo.findOne(orderFindOptions);
        if (!releaseGood)
            throw new Error(`Failed to find release of goods with passed order no (${orderNo})`);
        wsFindOptions.where['releaseGood'] = releaseGood;
    }
    else {
        throw new Error(`Order type (${orderType}) is not target to check about having VAS`);
    }
    return await wsRepo.findOne(wsFindOptions);
}
exports.havingVas = havingVas;
//# sourceMappingURL=having-vas.js.map