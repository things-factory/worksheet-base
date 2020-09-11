"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const typeorm_1 = require("typeorm");
const entities_1 = require("../../../entities");
exports.worksheetDetailsByProductGroupResolver = {
    async worksheetDetailsByProductGroup(_, { worksheetNo, batchId, productName, packingType }, context) {
        var _a, _b;
        const worksheet = await typeorm_1.getRepository(entities_1.Worksheet).findOne({
            where: { domain: context.state.domain, name: worksheetNo },
            relations: ['bizplace', 'releaseGood']
        });
        if (!worksheet)
            throw new Error(`Couldn't find worksheet`);
        const bizplaceId = (_b = (_a = worksheet) === null || _a === void 0 ? void 0 : _a.bizplace) === null || _b === void 0 ? void 0 : _b.id;
        if (!bizplaceId)
            throw new Error(`Couldn't find bizplace id`);
        const qb = typeorm_1.getRepository(entities_1.WorksheetDetail).createQueryBuilder('WSD');
        const [items, total] = await qb
            .leftJoinAndSelect('WSD.targetInventory', 'ORD_INV')
            .leftJoinAndSelect('ORD_INV.inventory', 'INV')
            .leftJoinAndSelect('INV.location', 'LOC')
            .leftJoinAndSelect('INV.product', 'PROD')
            .andWhere('"WSD"."domain_id" = :domainId')
            .andWhere('"WSD"."bizplace_id" = :bizplaceId')
            .andWhere('"ORD_INV"."release_good_id" = :releaseGoodId')
            .andWhere('"ORD_INV"."batch_id" = :batchId')
            .andWhere('"PROD"."name" = :productName')
            .andWhere('"ORD_INV"."packing_type" = :packingType')
            .setParameters({
            domainId: context.state.domain.id,
            releaseGoodId: worksheet.releaseGood.id,
            bizplaceId,
            batchId,
            productName,
            packingType
        })
            .getManyAndCount();
        return {
            items,
            total
        };
    }
};
//# sourceMappingURL=worksheet-details-by-product-group.js.map