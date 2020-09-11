"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const warehouse_base_1 = require("@things-factory/warehouse-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
const generate_putaway_worksheet_1 = require("./generate-putaway-worksheet");
exports.generatePartialPutawayWorksheetResolver = {
    async generatePartialPutawayWorksheet(_, { arrivalNoticeNo, inventories }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            const arrivalNotice = await trxMgr.getRepository(sales_base_1.ArrivalNotice).findOne({
                where: {
                    domain: context.state.domain,
                    name: arrivalNoticeNo
                },
                relations: ['bizplace']
            });
            inventories = await trxMgr.getRepository(warehouse_base_1.Inventory).findByIds(inventories.map((inv) => inv.id));
            await generate_putaway_worksheet_1.generatePutawayWorksheet(context.state.domain, arrivalNotice, inventories, context.state.user, trxMgr);
            const unloadingWorksheet = await trxMgr.getRepository(entities_1.Worksheet).findOne({
                where: { arrivalNotice, type: constants_1.WORKSHEET_TYPE.UNLOADING },
                relations: [
                    'worksheetDetails',
                    'worksheetDetails.targetInventory',
                    'worksheetDetails.targetInventory.inventory'
                ]
            });
            const remainPalltCnt = await trxMgr.getRepository(warehouse_base_1.Inventory).count({
                where: {
                    domain: context.state.domain,
                    refOrderId: arrivalNotice.id,
                    status: constants_1.WORKSHEET_STATUS.PARTIALLY_UNLOADED
                }
            });
            const wsdStatus = remainPalltCnt >= 0 ? constants_1.WORKSHEET_STATUS.PARTIALLY_UNLOADED : constants_1.WORKSHEET_STATUS.EXECUTING;
            const worksheetDetails = unloadingWorksheet.worksheetDetails;
            await Promise.all(worksheetDetails.map(async (wsd) => {
                var _a, _b, _c;
                if (((_c = (_b = (_a = wsd) === null || _a === void 0 ? void 0 : _a.targetInventory) === null || _b === void 0 ? void 0 : _b.inventory) === null || _c === void 0 ? void 0 : _c.status) !== warehouse_base_1.INVENTORY_STATUS.PARTIALLY_UNLOADED) {
                    await trxMgr.getRepository(entities_1.WorksheetDetail).save(Object.assign(Object.assign({}, wsd), { status: wsdStatus, updater: context.state.user }));
                }
            }));
        });
    }
};
//# sourceMappingURL=generate-partial-putaway-worksheet.js.map