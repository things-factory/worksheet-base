"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const auth_base_1 = require("@things-factory/auth-base");
const biz_base_1 = require("@things-factory/biz-base");
const sales_base_1 = require("@things-factory/sales-base");
const shell_1 = require("@things-factory/shell");
const typeorm_1 = require("typeorm");
const entities_1 = require("../../../entities");
const constants_1 = require("../../../constants");
const utils_1 = require("../../../utils");
exports.proceedExtraProductsResolver = {
    async proceedExtraProducts(_, { ganNo, approvedProducts, rejectedProducts }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            var _a, _b, _c;
            // Validation
            // Check status of GAN
            const customerBizplace = await biz_base_1.getMyBizplace(context.state.user);
            const arrivalNotice = await trxMgr.getRepository(sales_base_1.ArrivalNotice).findOne({
                where: {
                    domain: context.state.domain,
                    bizplace: customerBizplace,
                    name: ganNo
                },
                relations: ['orderProducts']
            });
            if (arrivalNotice.status !== sales_base_1.ORDER_STATUS.PROCESSING)
                throw new Error(`Status (${arrivalNotice.status}) of GAN is not available to proceed extra products.`);
            // Validation
            // Check numbers of target products
            // (approvedProducts + rejectedProducts = target order products)
            const targetProdCnt = arrivalNotice.orderProducts.filter((op) => op.status === sales_base_1.ORDER_PRODUCT_STATUS.READY_TO_APPROVED).length;
            if (approvedProducts.length + rejectedProducts.length != targetProdCnt)
                throw new Error(`Invalid numbers of extra products`);
            if ((_a = approvedProducts) === null || _a === void 0 ? void 0 : _a.length) {
                approvedProducts = approvedProducts.map((approvedProd) => {
                    return Object.assign(Object.assign({}, approvedProd), { status: sales_base_1.ORDER_PRODUCT_STATUS.READY_TO_UNLOAD, updater: context.state.user });
                });
                approvedProducts = await trxMgr.getRepository(sales_base_1.OrderProduct).save(approvedProducts);
                // Create worksheet details with approved order products
                const worksheet = await trxMgr.getRepository(entities_1.Worksheet).findOne({
                    where: {
                        domain: context.state.domain,
                        arrivalNotice,
                        type: constants_1.WORKSHEET_TYPE.UNLOADING,
                        status: constants_1.WORKSHEET_STATUS.EXECUTING
                    }
                });
                const unloadingWSD = approvedProducts.map((targetProduct) => {
                    return {
                        domain: context.state.domain,
                        bizplace: customerBizplace,
                        worksheet,
                        name: utils_1.WorksheetNoGenerator.unloadingDetail(),
                        targetProduct,
                        type: constants_1.WORKSHEET_TYPE.UNLOADING,
                        status: constants_1.WORKSHEET_STATUS.EXECUTING,
                        creator: context.state.user,
                        updater: context.state.user
                    };
                });
                await trxMgr.getRepository(entities_1.WorksheetDetail).save(unloadingWSD);
            }
            if ((_b = rejectedProducts) === null || _b === void 0 ? void 0 : _b.length) {
                await trxMgr
                    .getRepository(sales_base_1.OrderProduct)
                    .delete(rejectedProducts.map((rejectedProd) => rejectedProd.id));
            }
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
            if ((_c = users) === null || _c === void 0 ? void 0 : _c.length) {
                const msg = {
                    title: `Extra products approved/rejected by ${customerBizplace.name}`,
                    message: `Newly approved products are ready to unloading`,
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
//# sourceMappingURL=proceed-extra-products.js.map