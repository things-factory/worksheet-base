"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
exports.activateLoadingResolver = {
    async activateLoading(_, { worksheetNo, loadingWorksheetDetails }, context) {
        return typeorm_1.getManager().transaction(async (trxMgr) => {
            const domain = context.state.domain;
            const foundWorksheet = await trxMgr.getRepository(entities_1.Worksheet).findOne({
                where: {
                    domain,
                    name: worksheetNo,
                    status: constants_1.WORKSHEET_STATUS.DEACTIVATED,
                    type: constants_1.WORKSHEET_TYPE.LOADING
                },
                relations: ['bizplace', 'releaseGood', 'worksheetDetails', 'worksheetDetails.targetInventory']
            });
            if (!foundWorksheet)
                throw new Error(`Worksheet doesn't exists`);
            const relatedWorksheetCnt = await trxMgr.getRepository(entities_1.Worksheet).count({
                where: {
                    domain,
                    releaseGood: foundWorksheet.releaseGood,
                    type: constants_1.WORKSHEET_TYPE.VAS,
                    status: typeorm_1.Not(typeorm_1.Equal(constants_1.WORKSHEET_STATUS.DONE))
                }
            });
            // Stop to activate loading worksheet with Exception
            // This resolver is being called from client side not from other resolver.
            // So if there's a related worksheet, it should throw an Error to inform user about non-finished order.
            if (relatedWorksheetCnt) {
                throw new Error(`Related VAS order with RO: ${foundWorksheet.releaseGood.name} is still under processing.`);
            }
            return await activateLoading(worksheetNo, loadingWorksheetDetails, context.state.domain, context.state.user, trxMgr);
        });
    }
};
async function activateLoading(worksheetNo, loadingWorksheetDetails, domain, user, trxMgr) {
    /**
     * 1. Validation for worksheet
     *    - data existing
     *    - status of worksheet
     */
    const worksheetRepo = trxMgr ? trxMgr.getRepository(entities_1.Worksheet) : typeorm_1.getRepository(entities_1.Worksheet);
    const worksheetDetailRepo = trxMgr
        ? trxMgr.getRepository(entities_1.WorksheetDetail)
        : typeorm_1.getRepository(entities_1.WorksheetDetail);
    const orderInventoryRepo = trxMgr
        ? trxMgr.getRepository(sales_base_1.OrderInventory)
        : typeorm_1.getRepository(sales_base_1.OrderInventory);
    const releaseGoodRepo = trxMgr
        ? trxMgr.getRepository(sales_base_1.ReleaseGood)
        : typeorm_1.getRepository(sales_base_1.ReleaseGood);
    const foundWorksheet = await worksheetRepo.findOne({
        where: {
            domain,
            name: worksheetNo,
            type: constants_1.WORKSHEET_TYPE.LOADING,
            status: constants_1.WORKSHEET_STATUS.DEACTIVATED
        },
        relations: ['bizplace', 'releaseGood', 'worksheetDetails', 'worksheetDetails.targetInventory']
    });
    if (!foundWorksheet)
        throw new Error(`Worksheet doesn't exists`);
    const relatedWorksheetCnt = await worksheetRepo.count({
        where: {
            domain,
            releaseGood: foundWorksheet.releaseGood,
            type: constants_1.WORKSHEET_TYPE.VAS,
            status: typeorm_1.Not(typeorm_1.Equal(constants_1.WORKSHEET_STATUS.DONE))
        }
    });
    // Stop to activate loading worksheet without Exception
    // When this function called from other resolver, there might be something have to be done completely.
    // So even though there's a related worksheet, it doesn't throw an error at this point.
    if (relatedWorksheetCnt)
        return;
    const customerBizplace = foundWorksheet.bizplace;
    const foundWSDs = foundWorksheet.worksheetDetails;
    let targetInventories = foundWSDs.map((foundWSD) => foundWSD.targetInventory);
    /**
     * 2. Update description and status of loading worksheet details (status: DEACTIVATED => EXECUTING)
     */
    await Promise.all(loadingWorksheetDetails.map(async (loadingWorksheetDetail) => {
        await worksheetDetailRepo.update({
            domain,
            bizplace: customerBizplace,
            name: loadingWorksheetDetail.name,
            status: constants_1.WORKSHEET_STATUS.DEACTIVATED
        }, {
            description: loadingWorksheetDetail.description,
            status: constants_1.WORKSHEET_STATUS.EXECUTING,
            updater: user
        });
    }));
    /**
     * 3. Update target inventories (status: PICKED => LOADING)
     */
    targetInventories = targetInventories.map((targetInventory) => {
        return Object.assign(Object.assign({}, targetInventory), { status: sales_base_1.ORDER_INVENTORY_STATUS.LOADING, updater: user });
    });
    await orderInventoryRepo.save(targetInventories);
    /**
     * 4. Update loading Worksheet (status: DEACTIVATED => EXECUTING)
     */
    const worksheet = await worksheetRepo.save(Object.assign(Object.assign({}, foundWorksheet), { status: constants_1.WORKSHEET_STATUS.EXECUTING, startedAt: new Date(), updater: user }));
    /**
     * 5. Update Release Good (status: READY_TO_PICK => PICKING)
     */
    const releaseGood = foundWorksheet.releaseGood;
    await releaseGoodRepo.save(Object.assign(Object.assign({}, releaseGood), { status: sales_base_1.ORDER_STATUS.LOADING, updater: user }));
    return worksheet;
}
exports.activateLoading = activateLoading;
//# sourceMappingURL=activate-loading.js.map