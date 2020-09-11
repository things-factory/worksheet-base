"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const biz_base_1 = require("@things-factory/biz-base");
const sales_base_1 = require("@things-factory/sales-base");
const warehouse_base_1 = require("@things-factory/warehouse-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
const utils_1 = require("../../../utils");
exports.generateReleaseGoodWorksheetResolver = {
    async generateReleaseGoodWorksheet(_, { releaseGoodNo }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            return await generateReleaseGoodWorksheet(trxMgr, releaseGoodNo, context);
        });
    }
};
async function generateReleaseGoodWorksheet(trxMgr, releaseGoodNo, context) {
    const { domain, user } = context.state;
    let foundReleaseGood = await trxMgr.getRepository(sales_base_1.ReleaseGood).findOne({
        where: {
            domain,
            name: releaseGoodNo,
            bizplace: typeorm_1.In(await biz_base_1.getPermittedBizplaceIds(context.state.domain, context.state.user)),
            status: sales_base_1.ORDER_STATUS.PENDING_RECEIVE
        },
        relations: ['bizplace', 'orderInventories', 'orderInventories.inventory', 'orderVass']
    });
    if (!foundReleaseGood)
        throw new Error(`Release good doesn't exsits.`);
    const customerBizplace = foundReleaseGood.bizplace;
    let foundOIs = foundReleaseGood.orderInventories;
    let foundOVs = foundReleaseGood.orderVass;
    /*
     * 2. Create worksheet and worksheet details for inventories
     */
    // 2. 1) Create picking worksheet
    const pickingWorksheet = await trxMgr.getRepository(entities_1.Worksheet).save({
        domain,
        bizplace: customerBizplace,
        name: utils_1.WorksheetNoGenerator.picking(),
        releaseGood: foundReleaseGood,
        type: constants_1.WORKSHEET_TYPE.PICKING,
        status: constants_1.WORKSHEET_STATUS.DEACTIVATED,
        creator: user,
        updater: user
    });
    // order inventories is assigned when customer request pick by pallet
    if (foundOIs.every((oi) => { var _a, _b; return (_b = (_a = oi) === null || _a === void 0 ? void 0 : _a.inventory) === null || _b === void 0 ? void 0 : _b.id; }) || foundReleaseGood.crossDocking) {
        // 2. 2) Create picking worksheet details
        for (let oi of foundOIs) {
            await generatePickingWorksheetDetail(trxMgr, domain, customerBizplace, user, pickingWorksheet, oi);
        }
        foundOIs.map(async (oi) => {
            var _a;
            if ((_a = oi.inventory) === null || _a === void 0 ? void 0 : _a.id) {
                oi.inventory.lockedQty = oi.releaseQty;
                oi.inventory.lockedWeight = oi.releaseWeight;
                oi.inventory.updater = user;
                await trxMgr.getRepository(warehouse_base_1.Inventory).save(oi.inventory);
            }
        });
    }
    // 2. 2) Update status of order inventories (PENDING_RECEIVE => PENDING_SPLIT or READY_TO_PICK)
    // If order inventory was created by cross docking or already has assigned inventory
    // status will be READY_TO_PICK because the inventory will be assigned  dynamically
    // else if there's no assigned inventory status should be PENDING_SPLIT
    foundOIs = foundOIs.map((oi) => {
        var _a;
        let status = sales_base_1.ORDER_INVENTORY_STATUS.PENDING_SPLIT;
        if (oi.crossDocking || ((_a = oi.inventory) === null || _a === void 0 ? void 0 : _a.id)) {
            status = sales_base_1.ORDER_INVENTORY_STATUS.READY_TO_PICK;
        }
        oi.status = status;
        oi.updater = user;
        return oi;
    });
    await trxMgr.getRepository(sales_base_1.OrderInventory).save(foundOIs);
    /**
     * 3. Create worksheet and worksheet details for vass (if it exists)
     */
    let vasWorksheet = new entities_1.Worksheet();
    if (foundOVs && foundOVs.length) {
        // 3. 1) Create vas worksheet
        vasWorksheet = await trxMgr.getRepository(entities_1.Worksheet).save({
            domain,
            bizplace: customerBizplace,
            name: utils_1.WorksheetNoGenerator.vas(),
            releaseGood: foundReleaseGood,
            type: constants_1.WORKSHEET_TYPE.VAS,
            status: constants_1.WORKSHEET_STATUS.DEACTIVATED,
            creator: user,
            updater: user
        });
        // 3. 2) Create vas worksheet details
        const vasWorksheetDetails = foundOVs.map((ov) => {
            return {
                domain,
                bizplace: customerBizplace,
                worksheet: vasWorksheet,
                name: utils_1.WorksheetNoGenerator.vasDetail(),
                targetVas: ov,
                type: constants_1.WORKSHEET_TYPE.VAS,
                status: constants_1.WORKSHEET_STATUS.DEACTIVATED,
                creator: user,
                updater: user
            };
        });
        await trxMgr.getRepository(entities_1.WorksheetDetail).save(vasWorksheetDetails);
        // 3. 3) Update status of order vas (PENDING_RECEIVE => READY_TO_PROCESS)
        foundOVs = foundOVs.map((ov) => {
            ov.status = sales_base_1.ORDER_VAS_STATUS.READY_TO_PROCESS;
            ov.updater = user;
            return ov;
        });
        await trxMgr.getRepository(sales_base_1.OrderVas).save(foundOVs);
    }
    /**
     * 5. Update status of release good (PENDING_RECEIVE => READY_TO_PICK)
     */
    foundReleaseGood.status = sales_base_1.ORDER_STATUS.READY_TO_PICK;
    foundReleaseGood.updater = user;
    await trxMgr.getRepository(sales_base_1.ReleaseGood).save(foundReleaseGood);
    /**
     * 6. Returning worksheet as a result
     */
    return {
        pickingWorksheet,
        vasWorksheet
    };
}
exports.generateReleaseGoodWorksheet = generateReleaseGoodWorksheet;
/**
 * @description This function will generate picking worksheet detail
 * If you call this function without specified status, status will be set as DEACTIVATED
 *
 * @param {EntityManager} trxMgr
 * @param {Domain} domain
 * @param {Bizplace} bizplace
 * @param {User} user
 * @param {Worksheet} worksheet
 * @param {OrderInventory} targetInventory
 * @param {String} status
 */
async function generatePickingWorksheetDetail(trxMgr, domain, bizplace, user, worksheet, targetInventory, status = constants_1.WORKSHEET_STATUS.DEACTIVATED) {
    if (!constants_1.WORKSHEET_STATUS.hasOwnProperty(status))
        throw new Error('Passed status is not a candidate of available status');
    let pickingWSD = new entities_1.WorksheetDetail();
    pickingWSD.domain = domain;
    pickingWSD.bizplace = bizplace;
    pickingWSD.worksheet = worksheet;
    pickingWSD.name = utils_1.WorksheetNoGenerator.pickingDetail();
    pickingWSD.targetInventory = targetInventory;
    pickingWSD.type = constants_1.WORKSHEET_TYPE.PICKING;
    pickingWSD.status = status;
    pickingWSD.creator = user;
    pickingWSD.updater = user;
    return await trxMgr.getRepository(entities_1.WorksheetDetail).save(pickingWSD);
}
exports.generatePickingWorksheetDetail = generatePickingWorksheetDetail;
//# sourceMappingURL=generate-release-good-worksheet.js.map