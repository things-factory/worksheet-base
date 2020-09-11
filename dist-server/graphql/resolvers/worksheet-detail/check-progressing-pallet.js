"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const entities_1 = require("../../../entities");
const constants_1 = require("../../../constants");
const typeorm_1 = require("typeorm");
exports.checkProgressingPalletResolver = {
    async checkProgressingPallet(_, { palletId }, context) {
        const qb = typeorm_1.getRepository(entities_1.WorksheetDetail).createQueryBuilder('WSD');
        const cnt = await qb
            .leftJoin('WSD.targetInventory', 'T_INV')
            .leftJoin('T_INV.inventory', 'INV')
            .where('"INV"."domain_id" = :domainId', { domainId: context.state.domain.id })
            .andWhere('"INV"."pallet_id" = :palletId', { palletId })
            .andWhere('"WSD"."status" IN (:...status)', {
            status: [constants_1.WORKSHEET_STATUS.EXECUTING, constants_1.WORKSHEET_STATUS.DEACTIVATED],
        })
            .getCount();
        return Boolean(cnt);
    },
};
//# sourceMappingURL=check-progressing-pallet.js.map