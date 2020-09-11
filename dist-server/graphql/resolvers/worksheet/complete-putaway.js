"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const biz_base_1 = require("@things-factory/biz-base");
const sales_base_1 = require("@things-factory/sales-base");
const shell_1 = require("@things-factory/shell");
const warehouse_base_1 = require("@things-factory/warehouse-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
exports.completePutaway = {
    async completePutaway(_, { arrivalNoticeNo }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            var _a;
            /**
             * 1. Validation for worksheet
             *    - data existing
             */
            const arrivalNotice = await trxMgr.getRepository(sales_base_1.ArrivalNotice).findOne({
                // Because of partial unloading current status of arrivalNotice can be PUTTING_AWAY or PROCESSING
                // PUTTING_AWAY means unloading is completely finished.
                // PROCESSING means some products are still being unloaded.
                where: {
                    domain: context.state.domain,
                    name: arrivalNoticeNo,
                    status: typeorm_1.In([sales_base_1.ORDER_STATUS.PUTTING_AWAY, sales_base_1.ORDER_STATUS.PROCESSING])
                },
                relations: ['bizplace']
            });
            if (!arrivalNotice)
                throw new Error(`ArrivalNotice doesn't exists.`);
            const customerBizplace = arrivalNotice.bizplace;
            // Check whether unloading is done or not.
            const unloadingWorksheetCnt = await trxMgr.getRepository(entities_1.Worksheet).count({
                where: {
                    domain: context.state.domain,
                    bizplace: customerBizplace,
                    arrivalNotice,
                    type: constants_1.WORKSHEET_TYPE.UNLOADING,
                    status: constants_1.WORKSHEET_STATUS.EXECUTING
                }
            });
            if (unloadingWorksheetCnt)
                throw new Error(`Unloading is not completed yet`);
            const foundPutawayWorksheet = await trxMgr.getRepository(entities_1.Worksheet).findOne({
                where: {
                    domain: context.state.domain,
                    bizplace: customerBizplace,
                    status: constants_1.WORKSHEET_STATUS.EXECUTING,
                    type: constants_1.WORKSHEET_TYPE.PUTAWAY,
                    arrivalNotice
                },
                relations: [
                    'worksheetDetails',
                    'worksheetDetails.targetInventory',
                    'worksheetDetails.targetInventory.inventory',
                    'bufferLocation',
                    'bizplace'
                ]
            });
            if (!foundPutawayWorksheet)
                throw new Error(`Worksheet doesn't exists.`);
            const bufferLocation = foundPutawayWorksheet.bufferLocation;
            const relatedInventory = await trxMgr.getRepository(warehouse_base_1.Inventory).findOne({
                where: { domain: context.state.domain, location: bufferLocation }
            });
            if (!relatedInventory) {
                trxMgr.getRepository(warehouse_base_1.Location).save(Object.assign(Object.assign({}, bufferLocation), { status: warehouse_base_1.LOCATION_STATUS.EMPTY, updater: context.state.user }));
            }
            await trxMgr.getRepository(entities_1.Worksheet).save(Object.assign(Object.assign({}, foundPutawayWorksheet), { status: constants_1.WORKSHEET_STATUS.DONE, endedAt: new Date(), updater: context.state.user }));
            const worksheetDetails = foundPutawayWorksheet.worksheetDetails.map((worksheetDetail) => {
                return Object.assign(Object.assign({}, worksheetDetail), { status: constants_1.WORKSHEET_STATUS.DONE, updater: context.state.user });
            });
            await trxMgr.getRepository(entities_1.WorksheetDetail).save(worksheetDetails);
            let targetInventories = worksheetDetails.map((worksheetDetail) => worksheetDetail.targetInventory);
            targetInventories = targetInventories.map((orderInventory) => {
                return Object.assign(Object.assign({}, orderInventory), { status: sales_base_1.ORDER_PRODUCT_STATUS.TERMINATED, updater: context.state.user });
            });
            let inventories = worksheetDetails.map((worksheetDetail) => worksheetDetail.targetInventory.inventory);
            inventories = inventories.map((inventory) => {
                return Object.assign(Object.assign({}, inventory), { lockedQty: 0, updater: context.state.user });
            });
            await trxMgr.getRepository(warehouse_base_1.Inventory).save(inventories);
            // 2. If there's no more worksheet related with current arrival notice
            // update status of arrival notice
            // 2. 1) check wheter there are more worksheet or not
            const relatedWorksheets = await trxMgr.getRepository(entities_1.Worksheet).find({
                domain: context.state.domain,
                arrivalNotice,
                status: typeorm_1.Not(typeorm_1.Equal(constants_1.WORKSHEET_STATUS.DONE))
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
                    title: `Putaway has been completed`,
                    message: `${arrivalNoticeNo} is done`,
                    url: context.header.referer
                };
                users.forEach(user => {
                    shell_1.sendNotification({
                        receiver: user.id,
                        message: JSON.stringify(msg)
                    });
                });
            }
            if (!relatedWorksheets || (relatedWorksheets && relatedWorksheets.length === 0)) {
                // 3. update status of arrival notice
                await trxMgr.getRepository(sales_base_1.ArrivalNotice).save(Object.assign(Object.assign({}, arrivalNotice), { status: sales_base_1.ORDER_STATUS.DONE, updater: context.state.user }));
            }
        });
    }
};
//# sourceMappingURL=complete-putaway.js.map