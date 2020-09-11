"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
exports.activatePutawayResolver = {
    async activatePutaway(_, { worksheetNo, putawayWorksheetDetails }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            const domain = context.state.domain;
            const foundWorksheet = await trxMgr.getRepository(entities_1.Worksheet).findOne({
                where: {
                    domain,
                    name: worksheetNo,
                    status: constants_1.WORKSHEET_STATUS.DEACTIVATED,
                    type: constants_1.WORKSHEET_TYPE.PUTAWAY
                },
                relations: ['bizplace', 'arrivalNotice', 'worksheetDetails', 'worksheetDetails.targetInventory']
            });
            if (!foundWorksheet)
                throw new Error(`Worksheet doesn't exists`);
            const relatedWorksheetCnt = await trxMgr.getRepository(entities_1.Worksheet).count({
                where: {
                    domain,
                    arrivalNotice: foundWorksheet.arrivalNotice,
                    type: constants_1.WORKSHEET_TYPE.VAS,
                    status: typeorm_1.Not(typeorm_1.Equal(constants_1.WORKSHEET_STATUS.DONE))
                }
            });
            if (relatedWorksheetCnt) {
                throw new Error(`Related VAS order with GAN: ${foundWorksheet.arrivalNotice.name} is still under processing.`);
            }
            return await activatePutaway(worksheetNo, putawayWorksheetDetails, context.state.domain, context.state.user, trxMgr);
        });
    }
};
async function activatePutaway(worksheetNo, putawayWorksheetDetails, domain, user, trxMgr) {
    var _a, _b, _c;
    const wsRepo = ((_a = trxMgr) === null || _a === void 0 ? void 0 : _a.getRepository(entities_1.Worksheet)) || typeorm_1.getRepository(entities_1.Worksheet);
    const wsdRepo = ((_b = trxMgr) === null || _b === void 0 ? void 0 : _b.getRepository(entities_1.WorksheetDetail)) || typeorm_1.getRepository(entities_1.WorksheetDetail);
    const oiRepo = ((_c = trxMgr) === null || _c === void 0 ? void 0 : _c.getRepository(sales_base_1.OrderInventory)) || typeorm_1.getRepository(sales_base_1.OrderInventory);
    const foundWorksheet = await wsRepo.findOne({
        where: {
            domain,
            name: worksheetNo,
            status: constants_1.WORKSHEET_STATUS.DEACTIVATED,
            type: constants_1.WORKSHEET_TYPE.PUTAWAY
        },
        relations: ['bizplace', 'arrivalNotice', 'worksheetDetails', 'worksheetDetails.targetInventory']
    });
    if (!foundWorksheet)
        throw new Error(`Worksheet doesn't exists`);
    const relatedWorksheetCnt = await wsRepo.count({
        where: {
            domain,
            arrivalNotice: foundWorksheet.arrivalNotice,
            type: constants_1.WORKSHEET_TYPE.VAS,
            status: typeorm_1.Not(typeorm_1.Equal(constants_1.WORKSHEET_STATUS.DONE))
        }
    });
    if (relatedWorksheetCnt)
        return;
    const customerBizplace = foundWorksheet.bizplace;
    const foundWSDs = foundWorksheet.worksheetDetails;
    let targetInventories = foundWSDs.map((foundWSD) => foundWSD.targetInventory);
    /**
     * 2. Update description of putaway worksheet details
     */
    await Promise.all(putawayWorksheetDetails.map(async (putawayWorksheetDetail) => {
        await wsdRepo.update({
            domain,
            bizplace: customerBizplace,
            name: putawayWorksheetDetail.name,
            status: constants_1.WORKSHEET_STATUS.DEACTIVATED
        }, {
            description: putawayWorksheetDetail.description,
            status: constants_1.WORKSHEET_STATUS.EXECUTING,
            updater: user
        });
    }));
    /**
     * 3. Update target inventories (status: READY_TO_PUTAWAY => PUTTING_AWAY)
     */
    targetInventories = targetInventories.map((targetInventory) => {
        return Object.assign(Object.assign({}, targetInventory), { status: sales_base_1.ORDER_PRODUCT_STATUS.PUTTING_AWAY, updater: user });
    });
    await oiRepo.save(targetInventories);
    /**
     * 4. Update putaway Worksheet (status: DEACTIVATED => EXECUTING)
     */
    const worksheet = await wsRepo.save(Object.assign(Object.assign({}, foundWorksheet), { status: constants_1.WORKSHEET_STATUS.EXECUTING, startedAt: new Date(), updater: user }));
    return worksheet;
}
exports.activatePutaway = activatePutaway;
//# sourceMappingURL=activate-putaway.js.map