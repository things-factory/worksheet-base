"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const auth_base_1 = require("@things-factory/auth-base");
const biz_base_1 = require("@things-factory/biz-base");
const sales_base_1 = require("@things-factory/sales-base");
const shell_1 = require("@things-factory/shell");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
exports.proceedEditedBatchResolver = {
    async proceedEditedBatch(_, { ganNo, approvedProducts, rejectedProducts }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            var _a, _b, _c, _d;
            // Validation
            // Check status of GAN
            const customerBizplace = await biz_base_1.getMyBizplace(context.state.user);
            const arrivalNotice = await trxMgr.getRepository(sales_base_1.ArrivalNotice).findOne({
                where: {
                    domain: context.state.domain,
                    bizplace: customerBizplace,
                    name: ganNo
                },
                relations: ['orderProducts', 'orderProducts.product', 'orderVass', 'orderVass.targetProduct']
            });
            let foundOVs = arrivalNotice.orderVass;
            let foundOPs = arrivalNotice.orderProducts;
            if (arrivalNotice.status !== sales_base_1.ORDER_STATUS.PENDING_APPROVAL)
                throw new Error(`Status (${arrivalNotice.status}) of GAN is not available to proceed extra products.`);
            // Validation
            // Check numbers of target products
            // (approvedProducts + rejectedProducts = target order products)
            const targetProdCnt = arrivalNotice.orderProducts.filter((op) => op.status === sales_base_1.ORDER_PRODUCT_STATUS.PENDING_APPROVAL).length;
            if (approvedProducts.length + rejectedProducts.length != targetProdCnt)
                throw new Error(`Invalid numbers of approved batch no`);
            // Create worksheet details with approved order products
            let unloadingWS = await trxMgr.getRepository(entities_1.Worksheet).findOne({
                where: {
                    domain: context.state.domain,
                    arrivalNotice,
                    type: constants_1.WORKSHEET_TYPE.UNLOADING,
                    status: constants_1.WORKSHEET_STATUS.PENDING_APPROVAL
                },
                relations: ['worksheetDetails']
            });
            if ((_a = approvedProducts) === null || _a === void 0 ? void 0 : _a.length) {
                approvedProducts = await Promise.all(approvedProducts.map(async (approvedProd) => {
                    return Object.assign(Object.assign({}, approvedProd), { remark: `Previous Batch No - ${approvedProd.batchId}, has been adjusted into ${approvedProd.adjustedBatchId}`, batchId: approvedProd.adjustedBatchId, status: sales_base_1.ORDER_PRODUCT_STATUS.READY_TO_UNLOAD, updater: context.state.user });
                }));
                await trxMgr.getRepository(sales_base_1.OrderProduct).save(approvedProducts);
            }
            if ((_b = foundOVs) === null || _b === void 0 ? void 0 : _b.length) {
                foundOVs = await Promise.all(foundOVs.map(async (ov) => {
                    if (ov.targetType === constants_1.TARGET_TYPE.BATCH_NO) {
                        const foundOP = foundOPs.find((op) => op.batchId === ov.targetBatchId);
                        return Object.assign(Object.assign({}, ov), { targetBatchId: foundOP.adjustedBatchId, updater: context.state.user });
                    }
                    else if (ov.targetType === constants_1.TARGET_TYPE.BATCH_AND_PRODUCT_TYPE) {
                        const foundOP = foundOPs.find((op) => op.batchId === ov.targetBatchId && op.product.name === ov.targetProduct.name);
                        return Object.assign(Object.assign({}, ov), { targetBatchId: foundOP.adjustedBatchId, updater: context.state.user });
                    }
                }));
                await trxMgr.getRepository(sales_base_1.OrderVas).save(foundOVs);
            }
            if ((_c = rejectedProducts) === null || _c === void 0 ? void 0 : _c.length) {
                rejectedProducts = await Promise.all(rejectedProducts.map(async (rejectedProd) => {
                    return Object.assign(Object.assign({}, rejectedProd), { remark: `New adjustment batch no - ${rejectedProd.adjustedBatchId}, has been rejected`, status: sales_base_1.ORDER_PRODUCT_STATUS.READY_TO_UNLOAD, updater: context.state.user });
                }));
                await trxMgr.getRepository(sales_base_1.OrderProduct).save(rejectedProducts);
            }
            await trxMgr.getRepository(entities_1.Worksheet).save(Object.assign(Object.assign({}, unloadingWS), { status: constants_1.WORKSHEET_STATUS.DEACTIVATED, updater: context.state.user }));
            await trxMgr.getRepository(sales_base_1.ArrivalNotice).save(Object.assign(Object.assign({}, arrivalNotice), { status: sales_base_1.ORDER_STATUS.READY_TO_UNLOAD, updater: context.state.user }));
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
            if ((_d = users) === null || _d === void 0 ? void 0 : _d.length) {
                const msg = {
                    title: `Edited batch no approved/rejected by ${customerBizplace.name}`,
                    message: `Newly approved batch no is ready to be unloaded.`,
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
//# sourceMappingURL=proceed-edited-batch.js.map