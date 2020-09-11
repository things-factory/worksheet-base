"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const biz_base_1 = require("@things-factory/biz-base");
const sales_base_1 = require("@things-factory/sales-base");
const shell_1 = require("@things-factory/shell");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
const utils_1 = require("../../../utils");
const activate_loading_1 = require("./activate-loading");
exports.completePicking = {
    async completePicking(_, { releaseGoodNo }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            var _a;
            const releaseGood = await trxMgr.getRepository(sales_base_1.ReleaseGood).findOne({
                where: { domain: context.state.domain, name: releaseGoodNo, status: sales_base_1.ORDER_STATUS.PICKING },
                relations: ['bizplace', 'orderInventories']
            });
            if (!releaseGood)
                throw new Error(`Release Good doesn't exists.`);
            const customerBizplace = releaseGood.bizplace;
            const foundPickingWorksheet = await trxMgr.getRepository(entities_1.Worksheet).findOne({
                where: {
                    domain: context.state.domain,
                    bizplace: customerBizplace,
                    status: constants_1.WORKSHEET_STATUS.EXECUTING,
                    type: constants_1.WORKSHEET_TYPE.PICKING,
                    releaseGood
                },
                relations: [
                    'worksheetDetails',
                    'worksheetDetails.targetInventory',
                    'worksheetDetails.targetInventory.inventory'
                ]
            });
            if (!foundPickingWorksheet)
                throw new Error(`Worksheet doesn't exists.`);
            const worksheetDetails = foundPickingWorksheet.worksheetDetails;
            const targetInventories = worksheetDetails.map((wsd) => wsd.targetInventory);
            // filter out replaced inventory
            const pickedtargetInv = targetInventories.filter((targetInv) => targetInv.status === sales_base_1.ORDER_INVENTORY_STATUS.PICKED);
            // Update status and endedAt of worksheet
            await trxMgr.getRepository(entities_1.Worksheet).save(Object.assign(Object.assign({}, foundPickingWorksheet), { status: constants_1.WORKSHEET_STATUS.DONE, endedAt: new Date(), updater: context.state.user }));
            // Find Existing Loading Worksheet if any
            let existLoadingWorksheet = await trxMgr.getRepository(entities_1.Worksheet).findOne({
                where: {
                    releaseGood,
                    type: constants_1.WORKSHEET_TYPE.LOADING,
                    status: constants_1.WORKSHEET_STATUS.DEACTIVATED
                }
            });
            // 3. create loading worksheet
            const loadingWorksheet = existLoadingWorksheet
                ? existLoadingWorksheet
                : await trxMgr.getRepository(entities_1.Worksheet).save({
                    domain: context.state.domain,
                    releaseGood,
                    bizplace: customerBizplace,
                    name: utils_1.WorksheetNoGenerator.loading(),
                    type: constants_1.WORKSHEET_TYPE.LOADING,
                    status: constants_1.WORKSHEET_STATUS.DEACTIVATED,
                    creator: context.state.user,
                    updater: context.state.user
                });
            // 2) Create loading worksheet details
            let loadingWorksheetDetails = await Promise.all(pickedtargetInv.map(async (targetInventory) => {
                let existingLoadingWorksheetDetail = await trxMgr.getRepository(entities_1.WorksheetDetail).findOne({
                    where: {
                        domain: context.state.domain,
                        worksheet: loadingWorksheet,
                        targetInventory,
                        type: constants_1.WORKSHEET_TYPE.LOADING
                    }
                });
                return existingLoadingWorksheetDetail
                    ? Object.assign(Object.assign({}, existingLoadingWorksheetDetail), { status: constants_1.WORKSHEET_STATUS.DEACTIVATED }) : {
                    domain: context.state.domain,
                    bizplace: customerBizplace,
                    worksheet: loadingWorksheet,
                    name: utils_1.WorksheetNoGenerator.loadingDetail(),
                    targetInventory,
                    type: constants_1.WORKSHEET_TYPE.LOADING,
                    status: constants_1.WORKSHEET_STATUS.DEACTIVATED,
                    creator: context.state.user,
                    updater: context.state.user
                };
            }));
            loadingWorksheetDetails = await trxMgr.getRepository(entities_1.WorksheetDetail).save(loadingWorksheetDetails);
            await activate_loading_1.activateLoading(loadingWorksheet.name, loadingWorksheetDetails, context.state.domain, context.state.user, trxMgr);
            // 3. update status of release good
            await trxMgr.getRepository(sales_base_1.ReleaseGood).save(Object.assign(Object.assign({}, releaseGood), { status: sales_base_1.ORDER_STATUS.LOADING, updater: context.state.user }));
            // notification logics
            // get Customer Users
            const users = await trxMgr
                .getRepository('bizplaces_users')
                .createQueryBuilder('bu')
                .select('bu.user_id', 'id')
                .where(qb => {
                const subQuery = qb
                    .subQuery()
                    .select('bizplace.id')
                    .from(biz_base_1.Bizplace, 'bizplace')
                    .where('bizplace.name = :bizplaceName', { bizplaceName: customerBizplace.name })
                    .getQuery();
                return 'bu.bizplace_id IN ' + subQuery;
            })
                .getRawMany();
            // send notification to Customer Users
            if ((_a = users) === null || _a === void 0 ? void 0 : _a.length) {
                const msg = {
                    title: `Picking has been completed`,
                    message: `Items now are ready to be loaded`,
                    url: context.header.referer
                };
                users.forEach(user => {
                    shell_1.sendNotification({
                        receiver: user.id,
                        message: JSON.stringify(msg)
                    });
                });
            }
        });
    }
};
//# sourceMappingURL=complete-picking.js.map