"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../constants");
const entities_1 = require("../entities");
async function fetchExecutingWorksheet(domain, bizplace, relations, type, refOrder, trxMgr) {
    var _a;
    const wsRepo = ((_a = trxMgr) === null || _a === void 0 ? void 0 : _a.getRepository(entities_1.Worksheet)) || typeorm_1.getRepository(entities_1.Worksheet);
    const findOneOption = {
        where: {
            domain,
            bizplace,
            type
        },
        relations
    };
    if (refOrder instanceof sales_base_1.ArrivalNotice) {
        findOneOption.where['arrivalNotice'] = refOrder;
    }
    else if (refOrder instanceof sales_base_1.ReleaseGood) {
        findOneOption.where['releaseGood'] = refOrder;
    }
    else if (refOrder instanceof sales_base_1.VasOrder) {
        findOneOption.where['vasOrder'] = refOrder;
    }
    const worksheet = await wsRepo.findOne(findOneOption);
    if (!worksheet)
        throw new Error(`Couldn't find worksheet by order no (${refOrder.name})`);
    if (worksheet.status === constants_1.WORKSHEET_STATUS.EXECUTING) {
        return worksheet;
    }
    else if (worksheet.status === constants_1.WORKSHEET_STATUS.DONE) {
        throw new Error(`Worksheet is completed already`);
    }
    else if (worksheet.status === constants_1.WORKSHEET_STATUS.DEACTIVATED) {
        throw new Error(`Worksheet is not activated yet`);
    }
    else {
        throw new Error(`Current worksheet status (${worksheet.status}) is not proper to execute it.`);
    }
}
exports.fetchExecutingWorksheet = fetchExecutingWorksheet;
//# sourceMappingURL=worksheet-util.js.map