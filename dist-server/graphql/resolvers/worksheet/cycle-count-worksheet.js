"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sales_base_1 = require("@things-factory/sales-base");
const typeorm_1 = require("typeorm");
const constants_1 = require("../../../constants");
const entities_1 = require("../../../entities");
exports.cycleCountWorksheetResolver = {
    async cycleCountWorksheet(_, { inventoryCheckNo, locationSortingRules }, context) {
        var _a;
        const cycleCount = await typeorm_1.getRepository(sales_base_1.InventoryCheck).findOne({
            where: { domain: context.state.domain, name: inventoryCheckNo, status: sales_base_1.ORDER_STATUS.INSPECTING }
        });
        const worksheet = await typeorm_1.getRepository(entities_1.Worksheet).findOne({
            where: {
                domain: context.state.domain,
                inventoryCheck: cycleCount,
                type: constants_1.WORKSHEET_TYPE.CYCLE_COUNT,
                status: constants_1.WORKSHEET_STATUS.EXECUTING
            }
        });
        const qb = typeorm_1.createQueryBuilder(entities_1.WorksheetDetail, 'WSD');
        qb.leftJoinAndSelect('WSD.targetInventory', 'T_INV')
            .leftJoinAndSelect('T_INV.inventory', 'INV')
            .leftJoinAndSelect('T_INV.inspectedLocation', 'INS_LOC')
            .leftJoinAndSelect('INV.location', 'LOC')
            .leftJoinAndSelect('INV.product', 'PROD');
        if (((_a = locationSortingRules) === null || _a === void 0 ? void 0 : _a.length) > 0) {
            locationSortingRules.forEach((rule) => {
                qb.addOrderBy(`LOC.${rule.name}`, rule.desc ? 'DESC' : 'ASC');
            });
        }
        const worksheetDetails = await qb
            .where('"WSD"."worksheet_id" = :worksheetId', { worksheetId: worksheet.id })
            .andWhere('"WSD"."status" != :status', { status: constants_1.WORKSHEET_STATUS.REPLACED })
            .getMany();
        return {
            worksheetInfo: {
                startedAt: worksheet.startedAt
            },
            worksheetDetailInfos: worksheetDetails.map(async (cycleCountWSD) => {
                const targetInventory = cycleCountWSD.targetInventory;
                const inventory = targetInventory.inventory;
                return {
                    name: cycleCountWSD.name,
                    palletId: inventory.palletId,
                    batchId: inventory.batchId,
                    product: inventory.product,
                    qty: inventory.qty,
                    weight: inventory.weight,
                    inspectedQty: targetInventory.inspectedQty,
                    inspectedWeight: targetInventory.inspectedWeight,
                    inspectedLocation: targetInventory.inspectedLocation,
                    status: cycleCountWSD.status,
                    targetName: targetInventory.name,
                    packingType: inventory.packingType,
                    location: inventory.location
                };
            })
        };
    }
};
//# sourceMappingURL=cycle-count-worksheet.js.map