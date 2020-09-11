"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
exports.undoVas = {
    async undoVas(_, { worksheetDetail }, context) {
        return await typeorm_1.getManager().transaction(async (trxMgr) => {
            const worksheetDetailName = worksheetDetail.name;
            // Find worksheet detail by its name
            const foundWSD = await trxMgr.getRepository(entities_1.WorksheetDetail).findOne({
                where: {
                    domain: context.state.domain,
                    name: worksheetDetailName,
                    status: constants_1.WORKSHEET_STATUS.DONE,
                    type: constants_1.WORKSHEET_TYPE.VAS
                },
                relations: ['worksheet', 'targetVas', 'targetVas.vas', 'targetVas.vasOrder', 'targetVas.inventory']
            });
            // Validate record existing
            if (!foundWSD)
                throw new Error("Worksheet doesn't exists");
            const targetVas = foundWSD.targetVas;
            if (!targetVas)
                throw new Error("VAS doesn't exists");
            await trxMgr.getRepository(entities_1.WorksheetDetail).save(Object.assign(Object.assign({}, foundWSD), { status: constants_1.WORKSHEET_STATUS.EXECUTING, issue: '', updater: context.state.user }));
            // Update status of order vas
            await trxMgr.getRepository(sales_base_1.OrderVas).save(Object.assign(Object.assign({}, targetVas), { status: sales_base_1.ORDER_VAS_STATUS.PROCESSING, updater: context.state.user }));
            // }
        });
    }
};
//# sourceMappingURL=undo-vas.js.map