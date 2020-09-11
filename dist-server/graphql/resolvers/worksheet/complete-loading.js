"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
const utils_1 = require("../../../utils");
exports.completeLoading = {
    async completeLoading(_, { releaseGoodNo }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            var _a;
            const releaseGood = await trxMgr.getRepository(sales_base_1.ReleaseGood).findOne({
                where: { domain: context.state.domain, name: releaseGoodNo, status: sales_base_1.ORDER_STATUS.LOADING },
                relations: ['bizplace', 'orderInventories']
            });
            if (!releaseGood)
                throw new Error(`Release Good doesn't exists.`);
            const customerBizplace = releaseGood.bizplace;
            const foundLoadingWorksheet = await trxMgr.getRepository(entities_1.Worksheet).findOne({
                where: {
                    domain: context.state.domain,
                    bizplace: customerBizplace,
                    status: constants_1.WORKSHEET_STATUS.EXECUTING,
                    type: constants_1.WORKSHEET_TYPE.LOADING,
                    releaseGood
                },
                relations: ['worksheetDetails']
            });
            if (!foundLoadingWorksheet)
                throw new Error(`Worksheet doesn't exists.`);
            let targetInventories = await trxMgr.getRepository(sales_base_1.OrderInventory).find({
                where: { releaseGood, type: sales_base_1.ORDER_TYPES.RELEASE_OF_GOODS },
                relations: ['inventory']
            });
            // Update status of order inventories & remove locked_qty and locked_weight if it's exists
            let { loadedInventories, remainInventories } = targetInventories.reduce((obj, orderInv) => {
                if (orderInv.status === sales_base_1.ORDER_INVENTORY_STATUS.LOADED) {
                    obj.loadedInventories.push(orderInv);
                }
                else if (orderInv.status === sales_base_1.ORDER_INVENTORY_STATUS.LOADING) {
                    obj.remainInventories.push(orderInv);
                }
                return obj;
            }, {
                loadedInventories: [],
                remainInventories: []
            });
            // Update status of loaded order inventories
            loadedInventories = loadedInventories.map((targetInventory) => {
                return Object.assign(Object.assign({}, targetInventory), { status: sales_base_1.ORDER_INVENTORY_STATUS.TERMINATED, updater: context.state.user });
            });
            await trxMgr.getRepository(sales_base_1.OrderInventory).save(loadedInventories);
            // generate putaway worksheet with remain order inventories
            if ((_a = remainInventories) === null || _a === void 0 ? void 0 : _a.length) {
                await createReturnWorksheet(context.state.domain, customerBizplace, releaseGood, remainInventories, context.state.user, trxMgr);
                await trxMgr.getRepository(sales_base_1.ReleaseGood).save(Object.assign(Object.assign({}, releaseGood), { status: sales_base_1.ORDER_STATUS.PARTIAL_RETURN, updater: context.state.user }));
            }
            else {
                // Check whether there are related worksheet or not
                // If there no more order which is related with current release order
                // Update status to DONE
                await trxMgr.getRepository(sales_base_1.ReleaseGood).save(Object.assign(Object.assign({}, releaseGood), { status: sales_base_1.ORDER_STATUS.DONE, updater: context.state.user }));
            }
            // Update status and endedAt of worksheet
            await trxMgr.getRepository(entities_1.Worksheet).save(Object.assign(Object.assign({}, foundLoadingWorksheet), { status: constants_1.WORKSHEET_STATUS.DONE, endedAt: new Date(), updater: context.state.user }));
        });
    }
};
// Generating worksheet for returning process
async function createReturnWorksheet(domain, customerBizplace, releaseGood, orderInvs, user, trxMgr) {
    var _a, _b, _c;
    const wsRepo = ((_a = trxMgr) === null || _a === void 0 ? void 0 : _a.getRepository(entities_1.Worksheet)) || typeorm_1.getRepository(entities_1.Worksheet);
    const wsdRepo = ((_b = trxMgr) === null || _b === void 0 ? void 0 : _b.getRepository(entities_1.WorksheetDetail)) || typeorm_1.getRepository(entities_1.WorksheetDetail);
    const orderInvRepo = ((_c = trxMgr) === null || _c === void 0 ? void 0 : _c.getRepository(sales_base_1.OrderInventory)) || typeorm_1.getRepository(sales_base_1.OrderInventory);
    // create return worksheet
    const returnWorksheet = await wsRepo.save({
        domain,
        releaseGood,
        bizplace: customerBizplace,
        name: utils_1.WorksheetNoGenerator.return(),
        type: constants_1.WORKSHEET_TYPE.RETURN,
        status: constants_1.WORKSHEET_STATUS.DEACTIVATED,
        creator: user,
        updater: user
    });
    await Promise.all(orderInvs.map(async (targetInventory) => {
        targetInventory = await orderInvRepo.save(Object.assign(Object.assign({}, targetInventory), { status: sales_base_1.ORDER_INVENTORY_STATUS.RETURNING, updater: user }));
        // create new worksheetdetail for return process
        await wsdRepo.save({
            domain,
            bizplace: customerBizplace,
            name: utils_1.WorksheetNoGenerator.returnDetail(),
            type: constants_1.WORKSHEET_TYPE.RETURN,
            worksheet: returnWorksheet,
            targetInventory,
            status: constants_1.WORKSHEET_STATUS.DEACTIVATED,
            creator: user,
            updater: user
        });
    }));
}
exports.createReturnWorksheet = createReturnWorksheet;
//# sourceMappingURL=complete-loading.js.map