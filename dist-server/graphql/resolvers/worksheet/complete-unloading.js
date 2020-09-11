"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const auth_base_1 = require("@things-factory/auth-base");
const sales_base_1 = require("@things-factory/sales-base");
const shell_1 = require("@things-factory/shell");
const warehouse_base_1 = require("@things-factory/warehouse-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
const activate_putaway_1 = require("./activate-putaway");
const generate_putaway_worksheet_1 = require("./generate-putaway-worksheet");
exports.completeUnloading = {
    async completeUnloading(_, { arrivalNoticeNo, worksheetDetails }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            var _a;
            /**
             * 1. Validation for worksheet
             *    - data existing
             */
            const domain = context.state.domain;
            const user = context.state.user;
            let arrivalNotice = await trxMgr.getRepository(sales_base_1.ArrivalNotice).findOne({
                where: { domain, name: arrivalNoticeNo, status: sales_base_1.ORDER_STATUS.PROCESSING },
                relations: ['bizplace', 'orderProducts', 'releaseGood']
            });
            if (!arrivalNotice)
                throw new Error(`ArrivalNotice doesn't exists.`);
            /**
             * 2. Validation for non-approved order products
             *    - If there's non approved order product (status: READY_TO_APPROVED)
             *      throw Error.
             */
            if (arrivalNotice.orderProducts.some((op) => op.status === sales_base_1.ORDER_PRODUCT_STATUS.READY_TO_APPROVED))
                throw new Error(`There's non-approved order products`);
            const bizplace = arrivalNotice.bizplace;
            let foundWorksheet = await trxMgr.getRepository(entities_1.Worksheet).findOne({
                where: {
                    domain,
                    bizplace,
                    status: constants_1.WORKSHEET_STATUS.EXECUTING,
                    type: constants_1.WORKSHEET_TYPE.UNLOADING,
                    arrivalNotice
                },
                relations: [
                    'bizplace',
                    'bufferLocation',
                    'worksheetDetails',
                    'worksheetDetails.targetProduct',
                    'worksheetDetails.targetProduct.product'
                ]
            });
            if (!foundWorksheet)
                throw new Error(`Worksheet doesn't exists.`);
            let allPicked = [];
            let foundWorksheetDetails = foundWorksheet.worksheetDetails;
            let targetProducts = foundWorksheetDetails.map((foundWSD) => foundWSD.targetProduct);
            /** CROSS DOCKING **
             * If the cross docking item is not yet picked, need to finish picking first
             * If the picking is done and released all inbound items, putaway worksheet will not be generated
             *    - find the picking worksheet that is done
             *    - get all order inventories item
             *    - need to total up the qty and weight
             *    - compare product_id, batch_no, packing_type, release_qty and release_weight of order inventories with order products
             *    - check worksheet_details for picking if it is terminated
             */
            if (arrivalNotice.crossDocking) {
                const donePickingWorksheet = await trxMgr.getRepository(entities_1.Worksheet).findOne({
                    where: {
                        domain,
                        releaseGood: arrivalNotice.releaseGood,
                        type: constants_1.WORKSHEET_TYPE.PICKING,
                        status: typeorm_1.Equal(constants_1.WORKSHEET_STATUS.DONE)
                    },
                    relations: [
                        'bizplace',
                        'worksheetDetails',
                        'worksheetDetails.targetInventory',
                        'worksheetDetails.targetInventory.product'
                    ]
                });
                if (donePickingWorksheet) {
                    const donePickingWSD = donePickingWorksheet.worksheetDetails;
                    const targetInventories = donePickingWSD.map((doneWSD) => doneWSD.targetInventory);
                    targetProducts.forEach((targetProduct) => {
                        targetInventories.forEach((targetInventory) => {
                            if (
                            // since release order in cross docking will only release by product,
                            // we can use these parameters to check
                            targetInventory.product.id === targetProduct.product.id &&
                                targetInventory.packingType === targetProduct.packingType &&
                                targetInventory.batchId === targetProduct.batchId) {
                                if (targetInventory.releaseQty === targetProduct.actualPackQty &&
                                    targetInventory.releaseWeight === targetProduct.actualPackQty * targetProduct.weight)
                                    allPicked.push(true);
                                else
                                    allPicked.push(false);
                            }
                            // need to check if the there is order product without release qty and weight
                            // which means it will go to the inventory
                            else if (targetProduct.releaseQty === null ||
                                targetProduct.releaseQty === 0 ||
                                targetProduct.releaseWeight === null ||
                                targetProduct.releaseWeight === 0) {
                                allPicked.push(false);
                            }
                        });
                    });
                }
                // throw error if the picking worksheet is still executing
                else
                    throw new Error(`Picking should be completed before complete unloading for cross docking.`);
            }
            /**
             * Validation for partial unloaded pallets
             * If there are partially unloaded pallets throw Error
             */
            const partiallyUnloadedCnt = await trxMgr.getRepository(warehouse_base_1.Inventory).count({
                where: {
                    domain,
                    refOrderId: arrivalNotice.id,
                    bizplace,
                    status: warehouse_base_1.INVENTORY_STATUS.PARTIALLY_UNLOADED
                }
            });
            if (partiallyUnloadedCnt)
                throw new Error('There is partially unloaded pallet, generate putaway worksheet before complete unloading.');
            /**
             * 3. Update worksheet detail status (EXECUTING => DONE) & issue note
             */
            foundWorksheetDetails = foundWorksheetDetails.map((foundWSD) => {
                const worksheetDetail = worksheetDetails.find((worksheetDetail) => foundWSD.name === worksheetDetail.name);
                if (worksheetDetail && worksheetDetail.issue) {
                    foundWSD.issue = worksheetDetail.issue;
                    targetProducts = targetProducts.map((targetProduct) => {
                        if (foundWSD.targetProduct.id === targetProduct.id) {
                            return Object.assign(Object.assign({}, targetProduct), { remark: foundWSD.issue });
                        }
                        else {
                            return Object.assign({}, targetProduct);
                        }
                    });
                }
                return Object.assign(Object.assign({}, foundWSD), { status: constants_1.WORKSHEET_STATUS.DONE, updater: user });
            });
            await trxMgr.getRepository(entities_1.WorksheetDetail).save(foundWorksheetDetails);
            /**
             * 4. Update worksheet status (status: EXECUTING => DONE)
             */
            foundWorksheet = await trxMgr.getRepository(entities_1.Worksheet).save(Object.assign(Object.assign({}, foundWorksheet), { status: constants_1.WORKSHEET_STATUS.DONE, endedAt: new Date(), updater: user }));
            /**
             * 5. Update target products status (UNLOADED => TERMINATED)
             */
            targetProducts = targetProducts.map((targetProduct) => {
                return Object.assign(Object.assign({}, targetProduct), { status: sales_base_1.ORDER_PRODUCT_STATUS.TERMINATED, updater: user });
            });
            await trxMgr.getRepository(sales_base_1.OrderProduct).save(targetProducts);
            /**
             * 6. Check whether every related worksheet is completed
             *    - if yes => Update Status of arrival notice
             *    - VAS doesn't affect to status of arrival notice
             *    - Except putaway worksheet because putaway worksheet can be exist before complete unloading by partial unloading
             */
            const relatedWorksheets = await trxMgr.getRepository(entities_1.Worksheet).find({
                where: {
                    domain,
                    bizplace,
                    status: typeorm_1.Not(typeorm_1.Equal(constants_1.WORKSHEET_STATUS.DONE)),
                    type: typeorm_1.Not(typeorm_1.In([constants_1.WORKSHEET_TYPE.VAS, constants_1.WORKSHEET_TYPE.PUTAWAY])),
                    arrivalNotice
                }
            });
            // If there's no related order && if status of arrival notice is not indicating putaway process
            if (relatedWorksheets.length === 0 && arrivalNotice.status !== sales_base_1.ORDER_STATUS.PUTTING_AWAY) {
                await trxMgr.getRepository(sales_base_1.ArrivalNotice).save(Object.assign(Object.assign({}, arrivalNotice), { status: sales_base_1.ORDER_STATUS.READY_TO_PUTAWAY, updater: user }));
            }
            const inventories = await trxMgr.getRepository(warehouse_base_1.Inventory).find({
                where: {
                    domain,
                    refOrderId: arrivalNotice.id,
                    bizplace,
                    status: warehouse_base_1.INVENTORY_STATUS.UNLOADED
                }
            });
            let arrivalNoticeStatus;
            // if there is unpicked item, need to generate putaway worksheet
            if (allPicked.length == 0 || allPicked.includes(false)) {
                const putawayWorksheet = await generate_putaway_worksheet_1.generatePutawayWorksheet(domain, arrivalNotice, inventories, user, trxMgr);
                // Activate it if putaway worksheet is deactivated
                if (putawayWorksheet.status === constants_1.WORKSHEET_STATUS.DEACTIVATED) {
                    await activate_putaway_1.activatePutaway(putawayWorksheet.name, putawayWorksheet.worksheetDetails, domain, user, trxMgr);
                }
                arrivalNoticeStatus = sales_base_1.ORDER_STATUS.PUTTING_AWAY;
            }
            else {
                arrivalNoticeStatus = sales_base_1.ORDER_STATUS.DONE;
            }
            // generate GRN
            await sales_base_1.generateGoodsReceivalNote({ refNo: arrivalNotice.name, customer: arrivalNotice.bizplace.id }, context.state.domain, context.state.user, trxMgr);
            // Update status of arrival notice
            arrivalNotice = await trxMgr.getRepository(sales_base_1.ArrivalNotice).findOne({ where: { domain, id: arrivalNotice.id } });
            arrivalNotice.status = arrivalNoticeStatus;
            arrivalNotice.updater = user;
            await trxMgr.getRepository(sales_base_1.ArrivalNotice).save(arrivalNotice);
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
                    .andWhere('role.domain_id = :domain', { domain: domain.id })
                    .getQuery();
                return 'ur.roles_id IN ' + subQuery;
            })
                .getRawMany();
            // send notification to Office Admin Users
            if ((_a = users) === null || _a === void 0 ? void 0 : _a.length) {
                const msg = {
                    title: `Unloading Completed`,
                    message: `${arrivalNoticeNo} is ready for putaway`,
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
//# sourceMappingURL=complete-unloading.js.map