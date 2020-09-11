"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
exports.activateReturnResolver = {
    async activateReturn(_, { worksheetNo, returnWorksheetDetails }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            return await activateReturn(worksheetNo, returnWorksheetDetails, context.state.domain, context.state.user, trxMgr);
        });
    }
};
async function activateReturn(worksheetNo, returnWorksheetDetails, domain, user, trxMgr) {
    const worksheetRepo = trxMgr ? trxMgr.getRepository(entities_1.Worksheet) : typeorm_1.getRepository(entities_1.Worksheet);
    const worksheetDetailRepo = trxMgr
        ? trxMgr.getRepository(entities_1.WorksheetDetail)
        : typeorm_1.getRepository(entities_1.WorksheetDetail);
    const orderInventoryRepo = trxMgr
        ? trxMgr.getRepository(sales_base_1.OrderInventory)
        : typeorm_1.getRepository(sales_base_1.OrderInventory);
    const foundWorksheet = await worksheetRepo.findOne({
        where: {
            domain,
            name: worksheetNo,
            status: constants_1.WORKSHEET_STATUS.DEACTIVATED
        },
        relations: ['bizplace', 'releaseGood', 'worksheetDetails', 'worksheetDetails.targetInventory']
    });
    if (!foundWorksheet)
        throw new Error(`Worksheet doesn't exists`);
    const customerBizplace = foundWorksheet.bizplace;
    const foundWSDs = foundWorksheet.worksheetDetails;
    let targetInventories = foundWSDs.map((foundWSD) => foundWSD.targetInventory);
    /**
     * 2. Update description of putaway worksheet details
     */
    await Promise.all(returnWorksheetDetails.map(async (returnWorksheetDetail) => {
        await worksheetDetailRepo.update({
            domain,
            bizplace: customerBizplace,
            name: returnWorksheetDetail.name,
            status: constants_1.WORKSHEET_STATUS.DEACTIVATED
        }, {
            description: returnWorksheetDetail.description,
            status: constants_1.WORKSHEET_STATUS.EXECUTING,
            updater: user
        });
    }));
    /**
     * 3. Update target inventories (status: READY_TO_PUTAWAY => PUTTING_AWAY)
     */
    targetInventories = targetInventories.map((targetInventory) => {
        return Object.assign(Object.assign({}, targetInventory), { status: sales_base_1.ORDER_INVENTORY_STATUS.RETURNING, updater: user });
    });
    await orderInventoryRepo.save(targetInventories);
    /**
     * 4. Update return Worksheet (status: DEACTIVATED => EXECUTING)
     */
    const worksheet = await worksheetRepo.save(Object.assign(Object.assign({}, foundWorksheet), { status: constants_1.WORKSHEET_STATUS.EXECUTING, startedAt: new Date(), updater: user }));
    /**
     * 5. TODO: Create return order to track all return goods
     */
    return worksheet;
}
exports.activateReturn = activateReturn;
//# sourceMappingURL=activate-return.js.map