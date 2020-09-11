"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const auth_base_1 = require("@things-factory/auth-base");
const sales_base_1 = require("@things-factory/sales-base");
const shell_1 = require("@things-factory/shell");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
exports.completePreunload = {
    async completePreunload(_, { arrivalNoticeNo }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            var _a;
            const foundGAN = await trxMgr.getRepository(sales_base_1.ArrivalNotice).findOne({
                where: {
                    domain: context.state.domain,
                    name: arrivalNoticeNo,
                    status: sales_base_1.ORDER_STATUS.READY_TO_UNLOAD
                },
                relations: ['bizplace']
            });
            if (!foundGAN)
                throw new Error(`Arrival Notice doesn't exists.`);
            let foundOPs = await trxMgr.getRepository(sales_base_1.OrderProduct).find({
                where: {
                    domain: context.state.domain,
                    arrivalNotice: foundGAN
                }
            });
            if (foundOPs.some(op => op.status === sales_base_1.ORDER_PRODUCT_STATUS.INSPECTED)) {
                foundOPs = foundOPs.map((op) => {
                    var _a;
                    if ((_a = op) === null || _a === void 0 ? void 0 : _a.adjustedPalletQty) {
                        return Object.assign(Object.assign({}, op), { palletQty: op.adjustedPalletQty, status: op.status === sales_base_1.ORDER_PRODUCT_STATUS.INSPECTED ? sales_base_1.ORDER_PRODUCT_STATUS.READY_TO_UNLOAD : op.status, updater: context.state.user });
                    }
                });
                await trxMgr.getRepository(sales_base_1.OrderProduct).save(foundOPs);
            }
            const foundWS = await trxMgr.getRepository(entities_1.Worksheet).findOne({
                where: {
                    domain: context.state.domain,
                    arrivalNotice: foundGAN,
                    status: constants_1.WORKSHEET_STATUS.DEACTIVATED,
                    type: constants_1.WORKSHEET_TYPE.UNLOADING
                }
            });
            // notification logics
            // get Office Admin Users
            const users = await trxMgr
                .getRepository('users_roles')
                .createQueryBuilder('ur')
                .select('ur.users_id', 'id')
                .where(qb => {
                const subQuery = qb
                    .subQuery()
                    .select('role.id')
                    .from(auth_base_1.Role, 'role')
                    .where("role.name = 'Office Admin'")
                    .andWhere('role.domain_id = :domain', { domain: context.state.domain.id })
                    .getQuery();
                return 'ur.roles_id IN ' + subQuery;
            })
                .getRawMany();
            // send notification to Office Admin Users
            if ((_a = users) === null || _a === void 0 ? void 0 : _a.length) {
                const msg = {
                    title: `Pending Adjustment for ${foundGAN.name}`,
                    message: `Pending process for batch id adjustments`,
                    url: context.header.referer
                };
                users.forEach(user => {
                    shell_1.sendNotification({
                        receiver: user.id,
                        message: JSON.stringify(msg)
                    });
                });
            }
            /**
             * 5. Update Worksheet (status: DEACTIVATED => PENDING_ADJUSTMENT)
             */
            await trxMgr.getRepository(entities_1.Worksheet).save(Object.assign(Object.assign({}, foundWS), { status: constants_1.WORKSHEET_STATUS.PENDING_ADJUSTMENT, updater: context.state.user }));
            return;
        });
    }
};
//# sourceMappingURL=complete-preunload.js.map