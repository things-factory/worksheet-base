"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
const activate_loading_1 = require("./activate-loading");
const activate_putaway_1 = require("./activate-putaway");
const vas_transactions_1 = require("./vas-transactions");
const ENTITY_MAP = {
    [sales_base_1.ORDER_TYPES.ARRIVAL_NOTICE]: sales_base_1.ArrivalNotice,
    [sales_base_1.ORDER_TYPES.RELEASE_OF_GOODS]: sales_base_1.ReleaseGood,
    [sales_base_1.ORDER_TYPES.VAS_ORDER]: sales_base_1.VasOrder
};
const COMPLETE_TRX_MAP = {
    'vas-repalletizing': vas_transactions_1.completeRepalletizing,
    'vas-repack': vas_transactions_1.completeRepackaging,
    'vas-relabel': vas_transactions_1.completeRelabeling
};
exports.completeVas = {
    async completeVas(_, { orderNo, orderType }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            var _a;
            const domain = context.state.domain;
            const user = context.state.user;
            // Find out reference order to find specific vas worksheet
            const refOrder = await getReferenceOrder(trxMgr, domain, orderNo, orderType);
            // Find out VAS worksheet by referenced order to update
            const vasWS = await getVasWorksheet(trxMgr, domain, refOrder);
            // Update status of worksheet from EXECUTING to DONE
            vasWS.status = constants_1.WORKSHEET_STATUS.DONE;
            vasWS.endedAt = new Date();
            vasWS.updater = user;
            await trxMgr.getRepository(entities_1.Worksheet).save(vasWS);
            // Update status of worksheet detail from EXECUTING to DONE
            const vasWSDs = vasWS.worksheetDetails.map((wsd) => {
                wsd.status = constants_1.WORKSHEET_STATUS.DONE;
                wsd.updater = user;
                return wsd;
            });
            await trxMgr.getRepository(entities_1.WorksheetDetail).save(vasWSDs);
            // Update status of order vas from PROCESSING to TERMINATED
            const orderVASs = vasWSDs
                .map((wsd) => wsd.targetVas)
                .map((ov) => {
                ov.status = sales_base_1.ORDER_VAS_STATUS.TERMINATED;
                ov.updater = user;
                return ov;
            });
            await trxMgr.getRepository(sales_base_1.OrderVas).save(orderVASs);
            // Do complete operation transactions if there it is
            for (const ov of orderVASs) {
                const { issue } = vasWSDs.find((wsd) => wsd.targetVas.id === ov.id);
                if (((_a = ov) === null || _a === void 0 ? void 0 : _a.operationGuide) && !issue) {
                    await doOperationTransaction(trxMgr, ov, user);
                }
            }
            // Updats status of VAS Order to DONE when it's pure VAS Order
            if (refOrder instanceof sales_base_1.VasOrder) {
                refOrder.status = sales_base_1.ORDER_STATUS.DONE;
                refOrder.updater = user;
                await trxMgr.getRepository(sales_base_1.VasOrder).save(refOrder);
            }
            else {
                // Activate next worksheet if it's related with Arrival Notice or Release Goods and doesn't have issue
                const isIssueExists = vasWSDs.some((wsd) => wsd.issue);
                if (refOrder instanceof sales_base_1.ArrivalNotice && !isIssueExists) {
                    // Activate putaway worksheet
                    await activatePutawayWorksheet(trxMgr, domain, user, refOrder);
                }
                else if (refOrder instanceof sales_base_1.ReleaseGood && !isIssueExists) {
                    // Activate loading worksheet
                    await activateLoadingWorksheet(trxMgr, domain, user, refOrder);
                }
            }
        });
    }
};
/**
 * @description Find out specific order by its name and type
 *
 * @param {EntityManager} trxMgr
 * @param {Domain} domain
 * @param {String} orderNo
 * @param {String} orderType
 *
 * @returns {ArrivalNotice | ReleaseOrder | VasOrder} Found specific order
 */
async function getReferenceOrder(trxMgr, domain, orderNo, orderType) {
    const refOrder = await trxMgr
        .getRepository(ENTITY_MAP[orderType])
        .findOne({ where: { domain, name: orderNo }, relations: ['bizplace'] });
    if (!refOrder)
        throw new Error(`Couldn't find reference order by order number (${orderNo})`);
    return refOrder;
}
/**
 * @description Find specific VAS workshet by its referenced order
 * One VAS worksheet only can have one specific related order
 *
 * @param {EntityManager} trxMgr
 * @param {Domain} domain
 * @param {ArrivalNotice | ReleaseGood | VasOrder} refOrder
 * @returns {Promise<Worksheet>}
 */
async function getVasWorksheet(trxMgr, domain, refOrder) {
    let worksheet;
    let findOneOptions = {
        where: { domain, type: constants_1.WORKSHEET_TYPE.VAS, status: constants_1.WORKSHEET_STATUS.EXECUTING },
        relations: ['worksheetDetails', 'worksheetDetails.targetVas', 'worksheetDetails.targetVas.vas']
    };
    if (refOrder instanceof sales_base_1.ArrivalNotice) {
        findOneOptions.where['arrivalNotice'] = refOrder;
    }
    else if (refOrder instanceof sales_base_1.ReleaseGood) {
        findOneOptions.where['releaseGood'] = refOrder;
    }
    else if (refOrder instanceof sales_base_1.VasOrder) {
        findOneOptions.where['vasOrder'] = refOrder;
    }
    worksheet = await trxMgr.getRepository(entities_1.Worksheet).findOne(findOneOptions);
    if (!worksheet)
        throw new Error(`Couldn't find worksheet by reference order (${refOrder.name})`);
    return worksheet;
}
/**
 * @description Execute transactions which are related with special VAS
 * The transaction functions will be found from COMPLETE_TRX_MAP
 *
 * @param {EntityManager} trxMgr
 * @param {OrderVas} orderVas
 * @param {User} user
 */
async function doOperationTransaction(trxMgr, orderVas, user) {
    var _a, _b;
    const operationGuide = (_b = (_a = orderVas) === null || _a === void 0 ? void 0 : _a.vas) === null || _b === void 0 ? void 0 : _b.operationGuide;
    if (operationGuide) {
        await COMPLETE_TRX_MAP[operationGuide](trxMgr, orderVas, user);
    }
}
/**
 * @description Activating putaway worksheet
 *
 * @param {EntityManager} trxMgr
 * @param {Domain} domain
 * @param {User} user
 * @param {ArrivalNotice | ReleaseGood | VasOrder }refOrder
 */
async function activatePutawayWorksheet(trxMgr, domain, user, refOrder) {
    const bizplace = refOrder.bizplace;
    const putawayWS = await trxMgr.getRepository(entities_1.Worksheet).findOne({
        where: { domain, bizplace, type: constants_1.WORKSHEET_TYPE.PUTAWAY, arrivalNotice: refOrder },
        relations: ['worksheetDetails']
    });
    if (!putawayWS)
        throw new Error(`Couldn't find putaway worksheet related with (${refOrder.name})`);
    await activate_putaway_1.activatePutaway(putawayWS.name, putawayWS.worksheetDetails, domain, user, trxMgr);
}
/**
 * @description Activating loading worksheet
 *
 * @param {EntityManager} trxMgr
 * @param {Domain} domain
 * @param {User} user
 * @param {ArrivalNotice | ReleaseGood | VasOrder }refOrder
 */
async function activateLoadingWorksheet(trxMgr, domain, user, refOrder) {
    const bizplace = refOrder.bizplace;
    const loadingWS = await trxMgr.getRepository(entities_1.Worksheet).findOne({
        where: { domain, bizplace, type: constants_1.WORKSHEET_TYPE.LOADING, releaseGood: refOrder },
        relations: ['worksheetDetails']
    });
    if (!loadingWS)
        throw new Error(`Couldn't find loading worksheet related with (${refOrder.name})`);
    await activate_loading_1.activateLoading(loadingWS.name, loadingWS.worksheetDetails, domain, user, trxMgr);
}
//# sourceMappingURL=complete-vas.js.map