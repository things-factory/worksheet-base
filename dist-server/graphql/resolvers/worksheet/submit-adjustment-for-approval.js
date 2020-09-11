"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const biz_base_1 = require("@things-factory/biz-base");
const shell_1 = require("@things-factory/shell");
const typeorm_1 = require("typeorm");
const sales_base_1 = require("@things-factory/sales-base");
const entities_1 = require("../../../entities");
const constants_1 = require("../../../constants");
exports.submitAdjustmentForApprovalResolver = {
    async submitAdjustmentForApproval(_, { name }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            var _a;
            const foundArrivalNotice = await trxMgr.getRepository(sales_base_1.ArrivalNotice).findOne({
                where: { domain: context.state.domain, name, status: sales_base_1.ORDER_STATUS.READY_TO_UNLOAD },
                relations: [
                    'bizplace',
                    'orderProducts',
                    'orderProducts.product',
                    'orderVass',
                    'orderVass.vas',
                    'creator',
                    'updater'
                ]
            });
            let customerBizplace = foundArrivalNotice.bizplace;
            if (!foundArrivalNotice)
                throw new Error(`Arrival notice doesn't exists.`);
            const foundWS = await trxMgr.getRepository(entities_1.Worksheet).findOne({
                where: {
                    domain: context.state.domain,
                    arrivalNotice: foundArrivalNotice,
                    type: constants_1.WORKSHEET_TYPE.UNLOADING,
                    bizplace: customerBizplace
                }
            });
            if (!foundWS)
                throw new Error(`Worksheet doesn't exists.`);
            // 1. GAN Status change (READY_TO_UNLOAD => PENDING_APPROVAL)
            await trxMgr.getRepository(sales_base_1.ArrivalNotice).save(Object.assign(Object.assign({}, foundArrivalNotice), { status: sales_base_1.ORDER_STATUS.PENDING_APPROVAL, updater: context.state.user }));
            // 1. Worksheet Status change (PENDING_ADJUSTMENT => PENDING_APPROVAL)
            await trxMgr.getRepository(entities_1.Worksheet).save(Object.assign(Object.assign({}, foundWS), { status: sales_base_1.ORDER_STATUS.PENDING_APPROVAL, updater: context.state.user }));
            // notification logics
            // get Customer by bizplace
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
            // send notification to Office Admin Users
            if ((_a = users) === null || _a === void 0 ? void 0 : _a.length) {
                const msg = {
                    title: `Adjustment in Batch No`,
                    message: `There are batch no adjustment awaiting for your approval`,
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
//# sourceMappingURL=submit-adjustment-for-approval.js.map