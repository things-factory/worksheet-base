"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const biz_base_1 = require("@things-factory/biz-base");
const sales_base_1 = require("@things-factory/sales-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
const utils_1 = require("../../../utils");
exports.generateVasOrderWorksheet = {
    async generateVasOrderWorksheet(_, { vasNo }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            const foundVasOrder = await trxMgr.getRepository(sales_base_1.VasOrder).findOne({
                where: {
                    domain: context.state.domain,
                    name: vasNo,
                    bizplace: typeorm_1.In(await biz_base_1.getPermittedBizplaceIds(context.state.domain, context.state.user)),
                    status: sales_base_1.ORDER_STATUS.PENDING_RECEIVE
                },
                relations: ['bizplace', 'orderVass']
            });
            if (!foundVasOrder)
                throw new Error(`Vas order doesn't exsits.`);
            const customerBizplace = foundVasOrder.bizplace;
            let foundOVs = foundVasOrder.orderVass;
            /**
             * 3. Create worksheet and worksheet details for vass (if it exists)
             */
            let vasWorksheet = new entities_1.Worksheet();
            if (foundOVs && foundOVs.length) {
                // 2. 1) Create vas worksheet
                vasWorksheet = await trxMgr.getRepository(entities_1.Worksheet).save({
                    domain: context.state.domain,
                    bizplace: customerBizplace,
                    name: utils_1.WorksheetNoGenerator.vas(),
                    vasOrder: foundVasOrder,
                    type: constants_1.WORKSHEET_TYPE.VAS,
                    status: constants_1.WORKSHEET_STATUS.DEACTIVATED,
                    creator: context.state.user,
                    updater: context.state.user
                });
                // 2. 2) Create vas worksheet details
                const vasWorksheetDetails = foundOVs.map((ov, idx) => {
                    return {
                        domain: context.state.domain,
                        bizplace: customerBizplace,
                        worksheet: vasWorksheet,
                        name: utils_1.WorksheetNoGenerator.vasDetail(),
                        seq: idx,
                        targetVas: ov,
                        type: constants_1.WORKSHEET_TYPE.VAS,
                        status: constants_1.WORKSHEET_STATUS.DEACTIVATED,
                        creator: context.state.user,
                        updater: context.state.user
                    };
                });
                await trxMgr.getRepository(entities_1.WorksheetDetail).save(vasWorksheetDetails);
                // 2. 3) Update status of order vas (ARRIVED => READY_TO_PROCESS)
                foundOVs = foundOVs.map((ov) => {
                    return Object.assign(Object.assign({}, ov), { status: sales_base_1.ORDER_VAS_STATUS.READY_TO_PROCESS, updater: context.state.user });
                });
                await trxMgr.getRepository(sales_base_1.OrderVas).save(foundOVs);
            }
            /**
             * 5. Update status of vas order (PENDING_RECEIVE => READY_TO_EXECUTE)
             */
            await trxMgr.getRepository(sales_base_1.VasOrder).save(Object.assign(Object.assign({}, foundVasOrder), { status: sales_base_1.ORDER_STATUS.READY_TO_EXECUTE, updater: context.state.user }));
            /**
             * 6. Returning worksheet as a result
             */
            return {
                vasWorksheet
            };
        });
    }
};
//# sourceMappingURL=generate-vas-order-worksheet.js.map