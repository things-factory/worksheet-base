"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
exports.activateVasResolver = {
    async activateVas(_, { worksheetNo, vasWorksheetDetails }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            /**
             * 1. Validation for worksheet
             *    - data existing
             *    - status of worksheet
             */
            return await activateVas(trxMgr, context.state.domain, context.state.user, worksheetNo, vasWorksheetDetails);
        });
    }
};
async function activateVas(trxMgr, domain, user, worksheetNo, vasWorksheetDetails) {
    var _a;
    const foundWorksheet = await trxMgr.getRepository(entities_1.Worksheet).findOne({
        where: {
            domain,
            name: worksheetNo,
            status: constants_1.WORKSHEET_STATUS.DEACTIVATED
        },
        relations: ['bizplace', 'vasOrder', 'worksheetDetails', 'worksheetDetails.targetVas']
    });
    if (!foundWorksheet)
        throw new Error(`Worksheet doesn't exists`);
    const bizplace = foundWorksheet.bizplace;
    const foundWSDs = foundWorksheet.worksheetDetails.filter((worksheetDetail) => worksheetDetail.status !== constants_1.WORKSHEET_STATUS.DONE);
    const foundVasOrder = foundWorksheet.vasOrder;
    let targetVASs = foundWSDs
        .map((foundWSD) => foundWSD.targetVas)
        .filter((targetVas) => targetVas.status !== sales_base_1.ORDER_STATUS.DONE);
    /**
     * 2. Update description of vas worksheet details
     */
    await Promise.all(vasWorksheetDetails.map(async (vasWorksheetDetail) => {
        await trxMgr.getRepository(entities_1.WorksheetDetail).update({
            domain,
            bizplace,
            name: vasWorksheetDetail.name,
            status: constants_1.WORKSHEET_STATUS.DEACTIVATED,
            type: constants_1.WORKSHEET_TYPE.VAS
        }, {
            description: vasWorksheetDetail.description,
            status: constants_1.WORKSHEET_STATUS.EXECUTING,
            updater: user
        });
    }));
    /**
     * 3. Update target vass (status: READY_TO_PROCESS => PROCESSING)
     */
    targetVASs = targetVASs.map((targetVas) => {
        return Object.assign(Object.assign({}, targetVas), { status: sales_base_1.ORDER_VAS_STATUS.PROCESSING, updater: user });
    });
    await trxMgr.getRepository(sales_base_1.OrderVas).save(targetVASs);
    /**
     * 4. Update VAS Order if it's pure VAS Order (status: READY_TO_PROCESS => PROCESSING)
     */
    if ((_a = foundVasOrder) === null || _a === void 0 ? void 0 : _a.id) {
        await trxMgr.getRepository(sales_base_1.VasOrder).save(Object.assign(Object.assign({}, foundVasOrder), { status: sales_base_1.ORDER_STATUS.PROCESSING, updater: user }));
    }
    /**
     * 5. Update Worksheet (status: DEACTIVATED => EXECUTING)
     */
    return await trxMgr.getRepository(entities_1.Worksheet).save(Object.assign(Object.assign({}, foundWorksheet), { status: constants_1.WORKSHEET_STATUS.EXECUTING, startedAt: new Date(), updater: user }));
}
exports.activateVas = activateVas;
//# sourceMappingURL=activate-vas.js.map