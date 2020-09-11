"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
const activate_vas_1 = require("./activate-vas");
exports.activatePickingResolver = {
    async activatePicking(_, { worksheetNo }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            return await activatePicking(trxMgr, worksheetNo, context.state.domain, context.state.user);
        });
    }
};
async function activatePicking(trxMgr, worksheetNo, domain, user) {
    var _a;
    /**
     * 1. Validation for worksheet
     *    - data existing
     *    - status of worksheet
     */
    const foundWorksheet = await trxMgr.getRepository(entities_1.Worksheet).findOne({
        where: {
            domain,
            name: worksheetNo,
            type: constants_1.WORKSHEET_TYPE.PICKING,
            status: constants_1.WORKSHEET_STATUS.DEACTIVATED
        },
        relations: ['bizplace', 'releaseGood', 'worksheetDetails', 'worksheetDetails.targetInventory']
    });
    if (!foundWorksheet)
        throw new Error(`Worksheet doesn't exists`);
    let foundWSDs = foundWorksheet.worksheetDetails;
    let targetInventories = foundWSDs.map((foundWSD) => foundWSD.targetInventory);
    /**
     * 2. Update status of picking worksheet details (status: DEACTIVATED => EXECUTING)
     */
    foundWSDs = foundWSDs
        .filter(x => x.status == 'DEACTIVATED')
        .map((wsd) => {
        return Object.assign(Object.assign({}, wsd), { status: constants_1.WORKSHEET_STATUS.EXECUTING, updater: user });
    });
    await trxMgr.getRepository(entities_1.WorksheetDetail).save(foundWSDs);
    /**
     * 3. Update target inventories (status: READY_TO_PICK => PICKING)
     */
    targetInventories = targetInventories.map((ordInv) => {
        return Object.assign(Object.assign({}, ordInv), { status: sales_base_1.ORDER_INVENTORY_STATUS.PICKING, updater: user });
    });
    await trxMgr.getRepository(sales_base_1.OrderInventory).save(targetInventories);
    /**
     * 4. Update picking Worksheet (status: DEACTIVATED => EXECUTING)
     */
    const worksheet = await trxMgr.getRepository(entities_1.Worksheet).save(Object.assign(Object.assign({}, foundWorksheet), { status: constants_1.WORKSHEET_STATUS.EXECUTING, startedAt: new Date(), updater: user }));
    /**
     * 5. Update Release Good (status: READY_TO_PICK => PICKING)
     */
    const releaseGood = foundWorksheet.releaseGood;
    await trxMgr.getRepository(sales_base_1.ReleaseGood).save(Object.assign(Object.assign({}, releaseGood), { status: sales_base_1.ORDER_STATUS.PICKING, updater: user }));
    let relatedVasWorksheet = await trxMgr.getRepository(entities_1.Worksheet).findOne({
        where: { domain, releaseGood, type: constants_1.WORKSHEET_TYPE.VAS },
        relations: ['worksheetDetails']
    });
    /**
     * Activate VAS worksheet if it's exists
     * It means that there are VAS which is requested from customer side.
     *
     * VAS should be completed within picking step warehouse manager doesn't need to activate it manually.
     */
    if (relatedVasWorksheet) {
        await activate_vas_1.activateVas(trxMgr, domain, user, relatedVasWorksheet.name, relatedVasWorksheet.worksheetDetails);
    }
    /**
     * 6. Update PENDING_SPLIT order products (status: PENDING_SPLIT => TERMINATED)
     */
    const pendingSplitOrderInvs = await trxMgr.getRepository(sales_base_1.OrderInventory).find({
        where: { domain, releaseGood, status: sales_base_1.ORDER_INVENTORY_STATUS.PENDING_SPLIT }
    });
    if ((_a = pendingSplitOrderInvs) === null || _a === void 0 ? void 0 : _a.length) {
        await trxMgr.getRepository(sales_base_1.OrderInventory).delete(pendingSplitOrderInvs.map((ordInv) => ordInv.id));
    }
    return worksheet;
}
exports.activatePicking = activatePicking;
//# sourceMappingURL=activate-picking.js.map