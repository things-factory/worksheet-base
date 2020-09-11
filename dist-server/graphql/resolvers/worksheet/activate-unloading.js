"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
const activate_picking_1 = require("./activate-picking");
const activate_vas_1 = require("./activate-vas");
const worksheet_by_order_no_1 = require("./worksheet-by-order-no");
exports.activateUnloadingResolver = {
    async activateUnloading(_, { worksheetNo, unloadingWorksheetDetails }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            var _a, _b;
            /**
             * 1. Validation for worksheet
             *    - data existing
             *    - status of worksheet
             */
            let unloadingWS = await activateUnloading(trxMgr, worksheetNo, unloadingWorksheetDetails, context.state.domain, context.state.user);
            const crossDocking = (_b = (_a = unloadingWS) === null || _a === void 0 ? void 0 : _a.arrivalNotice) === null || _b === void 0 ? void 0 : _b.crossDocking;
            if (crossDocking) {
                unloadingWS = await trxMgr.getRepository(entities_1.Worksheet).findOne(unloadingWS.id, {
                    relations: ['arrivalNotice', 'arrivalNotice.releaseGood']
                });
            }
            if (crossDocking) {
                const pickingWS = await worksheet_by_order_no_1.worksheetByOrderNo(context.state.domain, unloadingWS.arrivalNotice.releaseGood.name, constants_1.WORKSHEET_TYPE.PICKING, trxMgr);
                // Check whether picking targets stored inventory
                if (pickingWS.worksheetDetails.every((wsd) => wsd.targetInventory.crossDocking)) {
                    await activate_picking_1.activatePicking(trxMgr, pickingWS.name, context.state.domain, context.state.user);
                }
            }
            return unloadingWS;
        });
    }
};
async function activateUnloading(trxMgr, worksheetNo, unloadingWorksheetDetails, domain, user) {
    const foundWorksheet = await trxMgr.getRepository(entities_1.Worksheet).findOne({
        where: {
            domain,
            name: worksheetNo,
            type: constants_1.WORKSHEET_TYPE.UNLOADING,
            status: constants_1.WORKSHEET_STATUS.DEACTIVATED
        },
        relations: ['bizplace', 'arrivalNotice', 'worksheetDetails', 'worksheetDetails.targetProduct']
    });
    if (!foundWorksheet)
        throw new Error(`Worksheet doesn't exists`);
    const customerBizplace = foundWorksheet.bizplace;
    const foundWSDs = foundWorksheet.worksheetDetails;
    let targetProducts = foundWSDs.map((foundWSD) => {
        return Object.assign(Object.assign({}, foundWSD.targetProduct), { palletQty: foundWSD.targetProduct.palletQty
                ? foundWSD.targetProduct.palletQty
                : unloadingWorksheetDetails.find((worksheetDetail) => worksheetDetail.name === foundWSD.name)
                    .palletQty });
    });
    /**
     * 2. Update description of product worksheet details (status: DEACTIVATED => EXECUTING)
     */
    await Promise.all(unloadingWorksheetDetails.map(async (unloadingWSD) => {
        await trxMgr.getRepository(entities_1.WorksheetDetail).update({
            domain,
            bizplace: customerBizplace,
            name: unloadingWSD.name,
            status: constants_1.WORKSHEET_STATUS.DEACTIVATED,
            worksheet: foundWorksheet
        }, {
            description: unloadingWSD.description,
            status: constants_1.WORKSHEET_STATUS.EXECUTING,
            updater: user
        });
    }));
    /**
     * 3. Update target products (status: READY_TO_UNLOAD => UNLOADING)
     */
    targetProducts = targetProducts.map((targetProduct) => {
        targetProduct.status = sales_base_1.ORDER_PRODUCT_STATUS.UNLOADING;
        targetProduct.updater = user;
        return targetProduct;
    });
    await trxMgr.getRepository(sales_base_1.OrderProduct).save(targetProducts);
    /**
     * 4. Update Arrival Notice (status: READY_TO_UNLOAD => PROCESSING)
     */
    let arrivalNotice = foundWorksheet.arrivalNotice;
    arrivalNotice.status = sales_base_1.ORDER_STATUS.PROCESSING;
    arrivalNotice.updater = user;
    await trxMgr.getRepository(sales_base_1.ArrivalNotice).save(arrivalNotice);
    let relatedVasWorksheet = await trxMgr.getRepository(entities_1.Worksheet).findOne({
        where: { domain, arrivalNotice, type: constants_1.WORKSHEET_TYPE.VAS },
        relations: ['worksheetDetails']
    });
    /**
     * Activate VAS worksheet if it's exists
     * It means that there are VAS which is requested from customer side.
     *
     * VAS should be completed within unloading step warehouse manager doesn't need to activate it manually.
     */
    if (relatedVasWorksheet) {
        await activate_vas_1.activateVas(trxMgr, domain, user, relatedVasWorksheet.name, relatedVasWorksheet.worksheetDetails);
    }
    /**
     * 5. Is VAS worksheet creating needed? (If there's some palletQty and palletizingDescription)
     *  - For loosen product case. (Without vas relation but description from palletizingDescription)
     *  - 5. 1) Check if there's VAS worksheet which is related with current arrival notice
     *          - YES => Append more VAS worksheet
     *          - NO => create additional VAS worksheet
     *  - 5. 2) Append new vas worksheet details
     */
    // Check there's some pallet qty and palletizingDescription => need to create vas worksheet
    // if (
    //   unloadingWorksheetDetails.some(
    //     (worksheetDetail: any) => worksheetDetail.palletQty && worksheetDetail.palletizingDescription
    //   )
    // ) {
    //   // Check if there's VAS worksheet which is related with current arrival notice order.
    //   if (!relatedVasWorksheet) {
    //     relatedVasWorksheet = await trxMgr.getRepository(Worksheet).save({
    //       domain,
    //       bizplace: customerBizplace,
    //       name: WorksheetNoGenerator.vas(),
    //       arrivalNotice,
    //       statedAt: new Date(),
    //       endedAt: new Date(),
    //       type: WORKSHEET_TYPE.VAS,
    //       status: WORKSHEET_STATUS.DONE,
    //       creator: user,
    //       updater: user
    //     })
    //   }
    //   const palletizingWSDs: WorksheetDetail[] | any[] = unloadingWorksheetDetails.filter(
    //     (worksheetDetail: any) => worksheetDetail.palletQty && worksheetDetail.palletizingDescription
    //   )
    //   let palletizingOrderVass: OrderVas[] = []
    //   for (let palletizingWSD of palletizingWSDs) {
    //     const originWSD: WorksheetDetail = foundWSDs.find(
    //       (foundWSD: WorksheetDetail) => foundWSD.name === palletizingWSD.name
    //     )
    //     const originOP: OrderProduct = await trxMgr.getRepository(OrderProduct).findOne({
    //       where: { domain, id: originWSD.targetProduct.id },
    //       relations: ['product']
    //     })
    //     const targetBatchId: string = originOP.batchId
    //     const targetProduct: Product = originOP.product
    //     const packingType: string = originOP.packingType
    //     const vas: Vas = await trxMgr.getRepository(Vas).findOne({
    //       where: { domain, id: palletizingWSD.palletizingVasId }
    //     })
    //     palletizingOrderVass.push({
    //       domain,
    //       name: OrderNoGenerator.orderVas(),
    //       arrivalNotice,
    //       vas,
    //       targetType: VAS_TARGET_TYPES.BATCH_AND_PRODUCT_TYPE,
    //       targetBatchId,
    //       targetProduct,
    //       packingType,
    //       description: palletizingWSD.palletizingDescription,
    //       batchId: palletizingWSD.batchId,
    //       bizplace: customerBizplace,
    //       type: ORDER_TYPES.ARRIVAL_NOTICE,
    //       status: ORDER_VAS_STATUS.COMPLETED
    //     })
    //   }
    //   palletizingOrderVass = await trxMgr.getRepository(OrderVas).save(palletizingOrderVass)
    //   const palletizingWorksheetDetails = palletizingOrderVass.map((ov: OrderVas) => {
    //     return {
    //       domain,
    //       bizplace: customerBizplace,
    //       worksheet: relatedVasWorksheet,
    //       name: WorksheetNoGenerator.vasDetail(),
    //       targetVas: ov,
    //       description: ov.description,
    //       type: WORKSHEET_TYPE.VAS,
    //       status: WORKSHEET_STATUS.DONE,
    //       creator: user,
    //       updater: user
    //     }
    //   })
    //   await trxMgr.getRepository(WorksheetDetail).save(palletizingWorksheetDetails)
    // }
    /**
     * 6. Update Worksheet (status: DEACTIVATED => EXECUTING)
     */
    return await trxMgr.getRepository(entities_1.Worksheet).save(Object.assign(Object.assign({}, foundWorksheet), { status: constants_1.WORKSHEET_STATUS.EXECUTING, startedAt: new Date(), updater: user }));
}
exports.activateUnloading = activateUnloading;
//# sourceMappingURL=activate-unloading.js.map