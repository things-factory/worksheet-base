"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const warehouse_base_1 = require("@things-factory/warehouse-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
const utils_1 = require("../../../utils");
const generate_release_good_worksheet_1 = require("./generate-release-good-worksheet");
exports.generateArrivalNoticeWorksheetResolver = {
    async generateArrivalNoticeWorksheet(_, { arrivalNoticeNo, bufferLocation }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            const { unloadingWorksheet, vasWorksheet, crossDocking } = await generateArrivalNoticeWorksheet(trxMgr, arrivalNoticeNo, bufferLocation, context);
            if (crossDocking) {
                const arrivalNotice = await trxMgr
                    .getRepository(sales_base_1.ArrivalNotice)
                    .findOne({ where: { domain: context.state.domain, name: arrivalNoticeNo }, relations: ['releaseGood'] });
                await generate_release_good_worksheet_1.generateReleaseGoodWorksheet(trxMgr, arrivalNotice.releaseGood.name, context);
            }
            return { unloadingWorksheet, vasWorksheet };
        });
    }
};
async function generateArrivalNoticeWorksheet(trxMgr, arrivalNoticeNo, bufferLocation, context) {
    const domain = context.state.domain;
    const user = context.state.user;
    /**
     * 1. Validation for arrival notice
     *    - data existing
     *    - status of arrival notice
     */
    let foundArrivalNotice = await trxMgr.getRepository(sales_base_1.ArrivalNotice).findOne({
        where: { domain, name: arrivalNoticeNo, status: sales_base_1.ORDER_STATUS.ARRIVED },
        relations: ['bizplace', 'orderProducts', 'orderVass']
    });
    if (!foundArrivalNotice)
        throw new Error(`Arrival notice doesn't exists.`);
    const customerBizplace = foundArrivalNotice.bizplace;
    let foundOPs = foundArrivalNotice.orderProducts;
    let foundOVs = foundArrivalNotice.orderVass;
    if (!bufferLocation || !bufferLocation.id)
        throw new Error(`Can't find buffer location`);
    const foundBufferLoc = await trxMgr.getRepository(warehouse_base_1.Location).findOne(bufferLocation.id);
    if (!foundBufferLoc)
        throw new Error(`location doesn't exists.`);
    /*
     * 2. Create worksheet and worksheet details for products
     */
    // 2. 1) Create unloading worksheet
    const unloadingWorksheet = await trxMgr.getRepository(entities_1.Worksheet).save({
        domain,
        bizplace: customerBizplace,
        name: utils_1.WorksheetNoGenerator.unloading(),
        bufferLocation: foundBufferLoc,
        arrivalNotice: foundArrivalNotice,
        type: constants_1.WORKSHEET_TYPE.UNLOADING,
        status: constants_1.WORKSHEET_STATUS.DEACTIVATED,
        creator: user,
        updater: user
    });
    // 2. 2) Create unloading worksheet details
    const unloadingWorksheetDetails = foundOPs.map((op) => {
        return {
            domain,
            bizplace: customerBizplace,
            worksheet: unloadingWorksheet,
            name: utils_1.WorksheetNoGenerator.unloadingDetail(),
            targetProduct: op,
            type: constants_1.WORKSHEET_TYPE.UNLOADING,
            status: constants_1.WORKSHEET_STATUS.DEACTIVATED,
            creator: user,
            updater: user
        };
    });
    await trxMgr.getRepository(entities_1.WorksheetDetail).save(unloadingWorksheetDetails);
    // 2. 3) Update status of order products (ARRIVED => READY_TO_UNLOAD)
    foundOPs = foundOPs.map((op) => {
        op.status = sales_base_1.ORDER_PRODUCT_STATUS.READY_TO_UNLOAD;
        op.updater = user;
        return op;
    });
    await trxMgr.getRepository(sales_base_1.OrderProduct).save(foundOPs);
    /**
     * 3. Create worksheet and worksheet details for vass (if it exists)
     */
    let vasWorksheet = new entities_1.Worksheet();
    if (foundOVs && foundOVs.length) {
        // 2. 1) Create vas worksheet
        vasWorksheet = await trxMgr.getRepository(entities_1.Worksheet).save({
            domain,
            bizplace: customerBizplace,
            name: utils_1.WorksheetNoGenerator.vas(),
            arrivalNotice: foundArrivalNotice,
            type: constants_1.WORKSHEET_TYPE.VAS,
            status: constants_1.WORKSHEET_STATUS.DEACTIVATED,
            creator: user,
            updater: user
        });
        // 2. 2) Create vas worksheet details
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
        // 2. 3) Update status of order vas (ARRIVED => READY_TO_PROCESS)
        foundOVs = foundOVs.map((ov) => {
            ov.status = sales_base_1.ORDER_VAS_STATUS.READY_TO_PROCESS;
            ov.updater = user;
            return ov;
        });
        await trxMgr.getRepository(sales_base_1.OrderVas).save(foundOVs);
    }
    /**
     * 5. Update status of arrival notice (ARRIVED => READY_TO_UNLOAD)
     */
    foundArrivalNotice.status = sales_base_1.ORDER_STATUS.READY_TO_UNLOAD;
    foundArrivalNotice.updater = user;
    await trxMgr.getRepository(sales_base_1.ArrivalNotice).save(foundArrivalNotice);
    /**
     * 6. Returning worksheet as a result
     */
    return {
        unloadingWorksheet,
        vasWorksheet,
        crossDocking: foundArrivalNotice.crossDocking
    };
}
//# sourceMappingURL=generate-arrival-notice-worksheet.js.map