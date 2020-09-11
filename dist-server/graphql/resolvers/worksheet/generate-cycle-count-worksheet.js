"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const biz_base_1 = require("@things-factory/biz-base");
const sales_base_1 = require("@things-factory/sales-base");
const warehouse_base_1 = require("@things-factory/warehouse-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
const utils_1 = require("../../../utils");
exports.generateCycleCountWorksheet = {
    async generateCycleCountWorksheet(_, { selectedInventory, executionDate }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            // generate order no for inventory check
            const cycleCountNo = sales_base_1.OrderNoGenerator.cycleCount();
            const orderType = sales_base_1.ORDER_TYPES.CYCLE_COUNT;
            const myBizplace = await biz_base_1.getMyBizplace(context.state.user);
            // generate order inventory
            const createdCycleOrder = await sales_base_1.generateCycleCount(cycleCountNo, executionDate, orderType, context.state.domain, context.state.user, trxMgr);
            // Find all the inventory ID based on selected inventory
            const foundInv = await trxMgr.getRepository(warehouse_base_1.Inventory).find({
                where: {
                    domain: context.state.domain,
                    palletId: typeorm_1.In(selectedInventory.map(inv => inv.palletId)),
                    status: warehouse_base_1.INVENTORY_STATUS.STORED
                }
            });
            // generate order inventory mapping with inventory ID
            const createdOIs = await trxMgr.getRepository(sales_base_1.OrderInventory).save(await Promise.all(foundInv.map(async (inv) => {
                let newOrderInv = {
                    domain: context.state.domain,
                    bizplace: myBizplace,
                    status: sales_base_1.ORDER_INVENTORY_STATUS.PENDING,
                    name: sales_base_1.OrderNoGenerator.orderInventory(),
                    inventoryCheck: createdCycleOrder,
                    releaseQty: 0,
                    releaseWeight: 0,
                    inventory: inv,
                    creator: context.state.user,
                    updater: context.state.user
                };
                return newOrderInv;
            })));
            // set a locked qty at all selected inventory
            const lockedInv = foundInv.map((inv) => {
                return Object.assign(Object.assign({}, inv), { lockedQty: inv.qty, lockedWeight: inv.weight, updater: context.state.user });
            });
            await trxMgr.getRepository(warehouse_base_1.Inventory).save(lockedInv);
            // create cycle count worksheet
            const cycleCountWorksheet = await trxMgr.getRepository(entities_1.Worksheet).save({
                domain: context.state.domain,
                bizplace: myBizplace,
                name: utils_1.WorksheetNoGenerator.cycleCount(),
                inventoryCheck: createdCycleOrder,
                type: constants_1.WORKSHEET_TYPE.CYCLE_COUNT,
                status: constants_1.WORKSHEET_STATUS.DEACTIVATED,
                creator: context.state.user,
                updater: context.state.user
            });
            // generate worksheet detail
            const cycleCountWSD = createdOIs.map((oi) => {
                return {
                    domain: context.state.domain,
                    bizplace: myBizplace,
                    worksheet: cycleCountWorksheet,
                    name: utils_1.WorksheetNoGenerator.cycleCountDetail(),
                    targetInventory: oi,
                    type: constants_1.WORKSHEET_TYPE.CYCLE_COUNT,
                    status: constants_1.WORKSHEET_STATUS.DEACTIVATED,
                    creator: context.state.user,
                    updater: context.state.user
                };
            });
            await trxMgr.getRepository(entities_1.WorksheetDetail).save(cycleCountWSD);
            /**
             * 6. Returning worksheet as a result
             */
            return { cycleCountWorksheet };
        });
    }
};
//# sourceMappingURL=generate-cycle-count-worksheet.js.map