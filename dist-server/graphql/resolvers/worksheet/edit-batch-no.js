"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const auth_base_1 = require("@things-factory/auth-base");
const sales_base_1 = require("@things-factory/sales-base");
const shell_1 = require("@things-factory/shell");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
exports.editBatchNo = {
    async editBatchNo(_, { worksheetNo, unloadingWorksheetDetails }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            var _a;
            /**
             * 1. Validation for worksheet
             *    - data existing
             *    - status of worksheet
             */
            const foundWorksheet = await trxMgr.getRepository(entities_1.Worksheet).findOne({
                where: {
                    domain: context.state.domain,
                    name: worksheetNo,
                    type: constants_1.WORKSHEET_TYPE.UNLOADING,
                    status: constants_1.WORKSHEET_STATUS.DEACTIVATED
                },
                relations: ['bizplace', 'arrivalNotice', 'worksheetDetails', 'worksheetDetails.targetProduct']
            });
            if (!foundWorksheet)
                throw new Error(`Worksheet doesn't exists`);
            const foundGAN = foundWorksheet.arrivalNotice;
            const foundWSDs = foundWorksheet.worksheetDetails;
            let targetProducts = foundWSDs.map((foundWSD) => {
                return Object.assign(Object.assign({}, foundWSD.targetProduct), { palletQty: foundWSD.targetProduct.palletQty
                        ? foundWSD.targetProduct.palletQty
                        : unloadingWorksheetDetails.find((worksheetDetail) => worksheetDetail.name === foundWSD.name).palletQty, adjustedBatchId: unloadingWorksheetDetails.find((worksheetDetail) => worksheetDetail.name === foundWSD.name).batchId, status: unloadingWorksheetDetails.find((worksheetDetail) => worksheetDetail.name === foundWSD.name)
                        .initialBatchId ===
                        unloadingWorksheetDetails.find((worksheetDetail) => worksheetDetail.name === foundWSD.name)
                            .batchId
                        ? sales_base_1.ORDER_PRODUCT_STATUS.READY_TO_UNLOAD
                        : sales_base_1.ORDER_PRODUCT_STATUS.PENDING_APPROVAL });
            });
            await trxMgr.getRepository(sales_base_1.OrderProduct).save(targetProducts);
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
            return await trxMgr.getRepository(entities_1.Worksheet).save(Object.assign(Object.assign({}, foundWorksheet), { status: constants_1.WORKSHEET_STATUS.PENDING_ADJUSTMENT, updater: context.state.user }));
        });
    }
};
//# sourceMappingURL=edit-batch-no.js.map