"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const typeorm_1 = require("typeorm");
const id_rule_base_1 = require("@things-factory/id-rule-base");
const entities_1 = require("../../../entities");
exports.generatePalletIdResolver = {
    async generatePalletId(_, { targets }, context) {
        // 1. get and set the date
        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth();
        const day = today.getDate();
        const yy = String(year).substr(String(year).length - 2);
        const mm = String(month + 1).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        const date = yy + mm + dd;
        let results = [];
        // 2. get worksheet detail
        let ids = targets.map((target) => target.id);
        // - getRepository using In(array) to pass the value to defined variable
        const foundWorksheetDetails = await typeorm_1.getRepository(entities_1.WorksheetDetail).find({
            where: {
                domain: context.state.domain,
                id: typeorm_1.In(ids),
            },
            relations: ['domain', 'bizplace', 'worksheet', 'worker', 'targetProduct', 'targetProduct.product'],
        });
        // 3. from worksheet detail get product name, product type, batchid, packing type, bizplace
        if (foundWorksheetDetails.length <= 0)
            throw new Error('Unable to find worksheet details');
        else {
            for (let i = 0; i < foundWorksheetDetails.length; i++) {
                let foundWSD = foundWorksheetDetails[i];
                for (let idx = 0; idx < targets.length; idx++) {
                    if (foundWSD.id === targets[idx].id) {
                        // 4. generate pallet id based on print qty > call generateId resolver
                        for (let i = 0; i < targets[idx].printQty; i++) {
                            const generatedPalletId = await id_rule_base_1.generateId({
                                domain: context.state.domain,
                                type: 'pallet_id',
                                seed: {
                                    batchId: foundWSD.targetProduct.batchId,
                                    date: date,
                                },
                            });
                            // 5. map all data to be returned
                            results.push(Object.assign(Object.assign({}, foundWSD.targetProduct), { palletId: generatedPalletId, bizplace: foundWSD.bizplace }));
                        }
                    }
                }
            }
        }
        return results;
    },
};
//# sourceMappingURL=generate-pallet-id.js.map