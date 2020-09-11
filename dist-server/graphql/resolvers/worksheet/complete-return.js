"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const biz_base_1 = require("@things-factory/biz-base");
const sales_base_1 = require("@things-factory/sales-base");
const shell_1 = require("@things-factory/shell");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
exports.completeReturn = {
    async completeReturn(_, { releaseGoodNo }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            var _a;
            /**
             * 1. Validation for worksheet
             *    - data existing
             */
            const releaseGood = await trxMgr.getRepository(sales_base_1.ReleaseGood).findOne({
                where: { domain: context.state.domain, name: releaseGoodNo, status: sales_base_1.ORDER_STATUS.PARTIAL_RETURN },
                relations: ['bizplace']
            });
            if (!releaseGood)
                throw new Error(`Release order doesn't exists.`);
            const customerBizplace = releaseGood.bizplace;
            const foundReturnWorksheet = await trxMgr.getRepository(entities_1.Worksheet).findOne({
                where: {
                    domain: context.state.domain,
                    bizplace: customerBizplace,
                    status: constants_1.WORKSHEET_STATUS.EXECUTING,
                    type: constants_1.WORKSHEET_TYPE.RETURN,
                    releaseGood
                },
                relations: ['worksheetDetails', 'worksheetDetails.targetInventory']
            });
            if (!foundReturnWorksheet)
                throw new Error(`Worksheet doesn't exists.`);
            await trxMgr.getRepository(entities_1.Worksheet).save(Object.assign(Object.assign({}, foundReturnWorksheet), { status: constants_1.WORKSHEET_STATUS.DONE, endedAt: new Date(), updater: context.state.user }));
            const worksheetDetails = foundReturnWorksheet.worksheetDetails.map((worksheetDetail) => {
                return Object.assign(Object.assign({}, worksheetDetail), { status: constants_1.WORKSHEET_STATUS.DONE, updater: context.state.user });
            });
            await trxMgr.getRepository(entities_1.WorksheetDetail).save(worksheetDetails);
            let targetInventories = worksheetDetails.map((worksheetDetail) => worksheetDetail.targetInventory);
            targetInventories = targetInventories.map((orderInventory) => {
                return Object.assign(Object.assign({}, orderInventory), { status: sales_base_1.ORDER_INVENTORY_STATUS.TERMINATED, updater: context.state.user });
            });
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
                    title: `Stock has been returned to storage`,
                    message: `${releaseGoodNo} is done`,
                    url: context.header.referer
                };
                users.forEach(user => {
                    shell_1.sendNotification({
                        receiver: user.id,
                        message: JSON.stringify(msg)
                    });
                });
            }
            // 3. update status of arrival notice
            await trxMgr.getRepository(sales_base_1.ReleaseGood).save(Object.assign(Object.assign({}, releaseGood), { status: sales_base_1.ORDER_STATUS.DONE, updater: context.state.user }));
        });
    }
};
//# sourceMappingURL=complete-return.js.map