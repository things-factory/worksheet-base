"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const biz_base_1 = require("@things-factory/biz-base");
const product_base_1 = require("@things-factory/product-base");
const warehouse_base_1 = require("@things-factory/warehouse-base");
const typeorm_1 = require("typeorm");
exports.checkRelabelableResolver = {
    async checkRelabelable(_, { batchId, productId, packingType, unitWeight }, context) {
        const domain = context.state.domain;
        const user = context.state.user;
        const bizplace = await biz_base_1.getMyBizplace(user);
        const product = await typeorm_1.getRepository(product_base_1.Product).findOne({
            where: { domain, bizplace, id: productId }
        });
        if (!product)
            throw new Error(`Couldn't find product by ID (${productId})`);
        return await checkRelabelable(domain, bizplace, batchId, product, packingType, unitWeight);
    }
};
/**
 * @description Try to find whether current inventory information can be accepted for relabeling.
 * The inventory should be exactly same with one of stored inventory
 * or
 * The inventory should be totally different with every single inventories stored.
 *
 * @param {Domain} domain
 * @param {Bizplace} bizplace
 * @param {String} batchId
 * @param {Product} product
 * @param {String} packingType
 * @param {Number} unitWeight
 */
async function checkRelabelable(domain, bizplace, batchId, product, packingType, unitWeight) {
    // Try to find out identical inventory
    // The condition is same batch id same product same packing type same unit weight
    // If there *IS* identical inventory the target inventory for this vas can be executed
    const identicalInvCnt = await typeorm_1.getRepository(warehouse_base_1.Inventory)
        .createQueryBuilder('inv')
        .where('inv.domain_id = :domainId')
        .andWhere('inv.bizplace_id = :bizplaceId')
        .andWhere('inv.batch_id = :batchId')
        .andWhere('inv.product_id = :productId')
        .andWhere('inv.packing_type = :packingType')
        .andWhere('inv.status != :status')
        .andWhere('(inv.weight / inv.qty) = :unitWeight')
        .setParameters({
        domainId: domain.id,
        bizplaceId: bizplace.id,
        batchId,
        productId: product.id,
        packingType,
        status: warehouse_base_1.INVENTORY_STATUS.TERMINATED,
        unitWeight
    })
        .getCount();
    if (identicalInvCnt)
        return true;
    // Try to find out duplicated invenetory
    // The condition is same batch id same product same packing type
    // If there's *NO* duplicated inventory the target inventory for this vas can be executed
    const duplicatedInvCnt = await typeorm_1.getRepository(warehouse_base_1.Inventory).count({
        where: { domain, bizplace, batchId, product, packingType, status: typeorm_1.Not(typeorm_1.Equal(warehouse_base_1.INVENTORY_STATUS.TERMINATED)) }
    });
    if (!duplicatedInvCnt)
        return true;
    return false;
}
exports.checkRelabelable = checkRelabelable;
//# sourceMappingURL=check-relabelable.js.map