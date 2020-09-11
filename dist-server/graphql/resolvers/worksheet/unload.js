"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const warehouse_base_1 = require("@things-factory/warehouse-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
const utils_1 = require("../../../utils");
exports.unload = {
    async unload(_, { worksheetDetailName, inventory }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            const palletId = inventory.palletId;
            // check duplication of reusable pallet
            const duplicatedReusablePallet = await trxMgr.getRepository(warehouse_base_1.Pallet).findOne({
                where: {
                    domain: context.state.domain,
                    name: palletId
                }
            });
            if (duplicatedReusablePallet)
                throw new Error(`Pallet ID (${duplicatedReusablePallet.name}) is duplicated`);
            // check duplication of pallet id
            const duplicatedInventory = await trxMgr.getRepository(warehouse_base_1.Inventory).findOne({
                where: {
                    domain: context.state.domain,
                    palletId
                }
            });
            if (duplicatedInventory)
                throw new Error(`Pallet ID (${duplicatedInventory.palletId}) is duplicated`);
            const qty = inventory.qty;
            // 1. find worksheet detail
            const foundWorksheetDetail = await trxMgr.getRepository(entities_1.WorksheetDetail).findOne({
                where: {
                    domain: context.state.domain,
                    name: worksheetDetailName,
                    type: constants_1.WORKSHEET_TYPE.UNLOADING
                },
                relations: [
                    'bizplace',
                    'targetProduct',
                    'targetProduct.product',
                    'worksheet',
                    'worksheet.arrivalNotice',
                    'worksheet.bufferLocation',
                    'worksheet.bufferLocation.warehouse'
                ]
            });
            if (!foundWorksheetDetail)
                throw new Error(`WorksheetDetail doesn't exists`);
            const worksheet = foundWorksheetDetail.worksheet;
            const arrivalNotice = worksheet.arrivalNotice;
            const customerBizplace = foundWorksheetDetail.bizplace;
            const bufferLocation = foundWorksheetDetail.worksheet.bufferLocation;
            let reusablePalletData = null;
            if (inventory.reusablePallet) {
                reusablePalletData = await trxMgr.getRepository(warehouse_base_1.Pallet).findOne({
                    domain: context.state.domain,
                    id: inventory.reusablePallet.id
                });
            }
            // 2. Create new inventory data
            // Find previous pallet ( Same batchId, Same product, Same pallet id)
            const prevInventory = await trxMgr.getRepository(warehouse_base_1.Inventory).findOne({
                domain: context.state.domain,
                bizplace: customerBizplace,
                palletId: palletId,
                status: typeorm_1.Not(typeorm_1.Equal(warehouse_base_1.INVENTORY_STATUS.TERMINATED)),
                warehouse: foundWorksheetDetail.worksheet.bufferLocation.warehouse,
                location: foundWorksheetDetail.worksheet.bufferLocation,
                zone: foundWorksheetDetail.worksheet.bufferLocation.zone
            });
            if (prevInventory)
                throw new Error('pallet id is duplicated');
            // 3. Create new inventory data
            let newInventory = await trxMgr.getRepository(warehouse_base_1.Inventory).save({
                domain: context.state.domain,
                bizplace: customerBizplace,
                palletId: palletId,
                batchId: foundWorksheetDetail.targetProduct.batchId,
                name: warehouse_base_1.InventoryNoGenerator.inventoryName(),
                product: foundWorksheetDetail.targetProduct.product,
                packingType: foundWorksheetDetail.targetProduct.packingType,
                qty,
                weight: Math.round(inventory.qty * foundWorksheetDetail.targetProduct.weight * 100) / 100,
                refOrderId: arrivalNotice.id,
                reusablePallet: reusablePalletData,
                warehouse: foundWorksheetDetail.worksheet.bufferLocation.warehouse,
                location: foundWorksheetDetail.worksheet.bufferLocation,
                zone: foundWorksheetDetail.worksheet.bufferLocation.zone,
                orderProductId: foundWorksheetDetail.targetProduct.id,
                status: warehouse_base_1.INVENTORY_STATUS.UNLOADED,
                creator: context.state.user,
                updater: context.state.user
            });
            // 4. Create new inventory history data
            await utils_1.generateInventoryHistory(newInventory, arrivalNotice, warehouse_base_1.INVENTORY_TRANSACTION_TYPE.UNLOADING, qty, Math.round(inventory.qty * foundWorksheetDetail.targetProduct.weight * 100) / 100, context.state.user, trxMgr);
            // 5. Update status and qty of targetProduct
            await trxMgr.getRepository(sales_base_1.OrderProduct).save(Object.assign(Object.assign({}, foundWorksheetDetail.targetProduct), { actualPalletQty: foundWorksheetDetail.targetProduct.actualPalletQty + 1, actualPackQty: foundWorksheetDetail.targetProduct.actualPackQty + qty, status: sales_base_1.ORDER_PRODUCT_STATUS.UNLOADED, updater: context.state.user }));
            // 6. Update status of buffer location
            // 6. 1) If status of location is empty
            if (bufferLocation.status === warehouse_base_1.LOCATION_STATUS.EMPTY) {
                await trxMgr.getRepository(warehouse_base_1.Location).save(Object.assign(Object.assign({}, bufferLocation), { status: warehouse_base_1.LOCATION_STATUS.OCCUPIED, updater: context.state.user }));
            }
        });
    }
};
//# sourceMappingURL=unload.js.map