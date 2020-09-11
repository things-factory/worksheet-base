"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const warehouse_base_1 = require("@things-factory/warehouse-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
const utils_1 = require("../../../utils");
exports.undoUnloading = {
    async undoUnloading(_, { worksheetDetailName, palletId }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            const foundWorksheetDetail = await trxMgr.getRepository(entities_1.WorksheetDetail).findOne({
                where: {
                    domain: context.state.domain,
                    name: worksheetDetailName,
                    status: typeorm_1.In([constants_1.WORKSHEET_STATUS.EXECUTING, constants_1.WORKSHEET_STATUS.PARTIALLY_UNLOADED])
                },
                relations: ['bizplace', 'targetProduct', 'worksheet', 'worksheet.arrivalNotice']
            });
            if (!foundWorksheetDetail)
                throw new Error("Worksheet doesn't exists");
            const arrivalNotice = foundWorksheetDetail.worksheet.arrivalNotice;
            // 1. find inventory
            let inventory = await trxMgr.getRepository(warehouse_base_1.Inventory).findOne({
                where: {
                    domain: context.state.domain,
                    status: warehouse_base_1.INVENTORY_STATUS.UNLOADED,
                    palletId
                },
                relations: ['location']
            });
            const bufferLocation = inventory.location;
            const inventoryQty = inventory.qty;
            const inventoryWeight = inventory.weight;
            await trxMgr.getRepository(sales_base_1.OrderProduct).save(Object.assign(Object.assign({}, foundWorksheetDetail.targetProduct), { actualPackQty: foundWorksheetDetail.targetProduct.actualPackQty - inventory.qty, actualPalletQty: foundWorksheetDetail.targetProduct.actualPalletQty - 1, status: sales_base_1.ORDER_PRODUCT_STATUS.UNLOADING, updater: context.state.user }));
            await trxMgr.getRepository(entities_1.WorksheetDetail).save(Object.assign(Object.assign({}, foundWorksheetDetail), { status: constants_1.WORKSHEET_STATUS.EXECUTING, updater: context.state.user }));
            // update inventory qty to 0
            await trxMgr.getRepository(warehouse_base_1.Inventory).save(Object.assign(Object.assign({}, inventory), { lastSeq: inventory.lastSeq + 1, status: warehouse_base_1.INVENTORY_STATUS.DELETED, qty: 0, weight: 0, updater: context.state.user }));
            inventory = await trxMgr.getRepository(warehouse_base_1.Inventory).findOne({
                where: { id: inventory.id },
                relations: ['bizplace', 'product', 'warehouse', 'location']
            });
            await utils_1.generateInventoryHistory(inventory, arrivalNotice, warehouse_base_1.INVENTORY_TRANSACTION_TYPE.UNDO_UNLOADING, -inventoryQty, -inventoryWeight, context.state.user, trxMgr);
            await trxMgr.getRepository(warehouse_base_1.Inventory).delete(inventory.id);
            // Check whether related worksheet exists or not with specific buffer location
            const relatedWorksheetCnt = await trxMgr
                .getRepository(entities_1.Worksheet)
                .count({ domain: context.state.domain, bufferLocation });
            // if there's no related worksheet => update status of location to EMPTY
            if (!relatedWorksheetCnt) {
                await trxMgr.getRepository(warehouse_base_1.Location).save(Object.assign(Object.assign({}, bufferLocation), { status: warehouse_base_1.LOCATION_STATUS.EMPTY, updater: context.state.user }));
            }
        });
    }
};
//# sourceMappingURL=undo-unloading.js.map