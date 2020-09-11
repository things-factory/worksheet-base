"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const warehouse_base_1 = require("@things-factory/warehouse-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
const utils_1 = require("../../../utils");
exports.generatePutawayWorksheetResolver = {
    async generatePutawayWorksheet(_, { arrivalNoticeNo, inventories }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            const arrivalNotice = await trxMgr.getRepository(sales_base_1.ArrivalNotice).findOne({
                where: {
                    domain: context.state.domain,
                    name: arrivalNoticeNo
                },
                relations: ['bizplace']
            });
            await generatePutawayWorksheet(context.state.domain, arrivalNotice, inventories, context.state.user, trxMgr);
            const unloadingWorksheet = await trxMgr.getRepository(entities_1.Worksheet).findOne({
                where: { arrivalNotice, type: constants_1.WORKSHEET_TYPE.UNLOADING },
                relations: [
                    'worksheetDetails',
                    'worksheetDetails.targetInventory',
                    'worksheetDetails.targetInventory.inventory'
                ]
            });
            const worksheetDetails = unloadingWorksheet.worksheetDetails;
            await Promise.all(worksheetDetails.map(async (wsd) => {
                var _a, _b, _c;
                if (((_c = (_b = (_a = wsd) === null || _a === void 0 ? void 0 : _a.targetInventory) === null || _b === void 0 ? void 0 : _b.inventory) === null || _c === void 0 ? void 0 : _c.status) !== warehouse_base_1.INVENTORY_STATUS.PARTIALLY_UNLOADED) {
                    await trxMgr.getRepository(entities_1.WorksheetDetail).save(Object.assign(Object.assign({}, wsd), { status: constants_1.WORKSHEET_STATUS.EXECUTING, updater: context.state.user }));
                }
            }));
        });
    }
};
/**
 * @description Generate putaway worksheet if it doesn't exist
 * and it will append new worksheet details and order inventoris based on passed inventories as param.
 * The above appending case is occured when user complete unloading partially.
 *
 * @param {Domain} domain
 * @param {ArrivalNotice} arrivalNotice
 * @param {Inventory[]} inventories
 * @param {User} user
 * @param {EntityManager} trxMgr
 *
 * @returns {Promise<Worksheet>} putaway worksheet which is generated or existing
 */
async function generatePutawayWorksheet(domain, arrivalNotice, inventories, user, trxMgr) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const ganRepo = ((_a = trxMgr) === null || _a === void 0 ? void 0 : _a.getRepository(sales_base_1.ArrivalNotice)) || typeorm_1.getRepository(sales_base_1.ArrivalNotice);
    const worksheetRepo = ((_b = trxMgr) === null || _b === void 0 ? void 0 : _b.getRepository(entities_1.Worksheet)) || typeorm_1.getRepository(entities_1.Worksheet);
    const ordInvRepo = ((_c = trxMgr) === null || _c === void 0 ? void 0 : _c.getRepository(sales_base_1.OrderInventory)) || typeorm_1.getRepository(sales_base_1.OrderInventory);
    const worksheetDetailRepo = ((_d = trxMgr) === null || _d === void 0 ? void 0 : _d.getRepository(entities_1.WorksheetDetail)) || typeorm_1.getRepository(entities_1.WorksheetDetail);
    const invRepo = ((_e = trxMgr) === null || _e === void 0 ? void 0 : _e.getRepository(warehouse_base_1.Inventory)) || typeorm_1.getRepository(warehouse_base_1.Inventory);
    if (!((_f = arrivalNotice) === null || _f === void 0 ? void 0 : _f.id))
        throw new Error(`Can't find gan id`);
    if (!((_h = (_g = arrivalNotice) === null || _g === void 0 ? void 0 : _g.bizplace) === null || _h === void 0 ? void 0 : _h.id)) {
        arrivalNotice = await ganRepo.findOne(arrivalNotice.id, {
            relations: ['bizplace']
        });
    }
    const bizplace = arrivalNotice.bizplace;
    const unloadingWorksheet = await worksheetRepo.findOne({
        where: { arrivalNotice, type: constants_1.WORKSHEET_TYPE.UNLOADING },
        relations: ['bufferLocation']
    });
    const bufferLocation = unloadingWorksheet.bufferLocation;
    // Check whether putaway worksheet is exists or not
    // If it's exists append new worksheet details into the putaway worksheet
    // If it's not exists create new putaway worksheet
    let putawayWorksheet = await worksheetRepo.findOne({
        where: {
            domain,
            arrivalNotice,
            bizplace,
            type: constants_1.WORKSHEET_TYPE.PUTAWAY
        }
    });
    let wsdStatus = constants_1.WORKSHEET_STATUS.DEACTIVATED; // Default status of worksheet is DEACTIVATED
    let oiStatus = sales_base_1.ORDER_PRODUCT_STATUS.UNLOADED; // Default status of order inventories is UNLOADED
    if (!putawayWorksheet) {
        putawayWorksheet = await worksheetRepo.save({
            domain,
            arrivalNotice,
            bizplace,
            name: utils_1.WorksheetNoGenerator.putaway(),
            type: constants_1.WORKSHEET_TYPE.PUTAWAY,
            status: constants_1.WORKSHEET_STATUS.DEACTIVATED,
            bufferLocation: unloadingWorksheet.bufferLocation,
            creator: user,
            updater: user
        });
    }
    else {
        // If there is putaway worksheet. It means unloading is completed partially.
        // So status of newly created worksheet details and order inventories should be changed to
        // Executing situation.
        wsdStatus = constants_1.WORKSHEET_STATUS.EXECUTING; // Default status = EXECUTING
        oiStatus = sales_base_1.ORDER_PRODUCT_STATUS.PUTTING_AWAY; // Default status = PUTTING_AWAY
    }
    await Promise.all(inventories.map(async (inventory) => {
        await invRepo.save(Object.assign(Object.assign({}, inventory), { status: warehouse_base_1.INVENTORY_STATUS.PUTTING_AWAY, updater: user }));
        const targetInventory = await ordInvRepo.save({
            domain,
            bizplace,
            name: sales_base_1.OrderNoGenerator.orderInventory(),
            status: oiStatus,
            type: sales_base_1.ORDER_TYPES.ARRIVAL_NOTICE,
            arrivalNotice,
            inventory,
            creator: user,
            updater: user
        });
        await worksheetDetailRepo.save({
            domain,
            bizplace,
            name: utils_1.WorksheetNoGenerator.putawayDetail(),
            worksheet: putawayWorksheet,
            type: constants_1.WORKSHEET_TYPE.PUTAWAY,
            targetInventory,
            fromLocation: bufferLocation,
            status: wsdStatus,
            creator: user,
            updater: user
        });
    }));
    return await worksheetRepo.findOne(putawayWorksheet.id, { relations: ['arrivalNotice', 'worksheetDetails'] });
}
exports.generatePutawayWorksheet = generatePutawayWorksheet;
//# sourceMappingURL=generate-putaway-worksheet.js.map