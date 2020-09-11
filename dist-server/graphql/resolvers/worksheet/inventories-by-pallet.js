"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const biz_base_1 = require("@things-factory/biz-base");
const sales_base_1 = require("@things-factory/sales-base");
const shell_1 = require("@things-factory/shell");
const warehouse_base_1 = require("@things-factory/warehouse-base");
const typeorm_1 = require("typeorm");
exports.inventoriesByPalletResolver = {
    async inventoriesByPallet(_, { filters, pagination, sortings, locationSortingRules }, context) {
        var _a, _b;
        const params = { filters, pagination };
        const permittedBizplaceIds = await biz_base_1.getPermittedBizplaceIds(context.state.domain, context.state.user);
        if (!params.filters.find((filter) => filter.name === 'bizplace')) {
            params.filters.push({
                name: 'bizplace',
                operator: 'in',
                value: permittedBizplaceIds,
                relation: true
            });
        }
        const qb = typeorm_1.getRepository(warehouse_base_1.Inventory).createQueryBuilder('iv');
        shell_1.buildQuery(qb, params, context);
        qb.leftJoinAndSelect('iv.domain', 'domain')
            .leftJoinAndSelect('iv.bizplace', 'bizplace')
            .leftJoinAndSelect('iv.product', 'product')
            .leftJoinAndSelect('iv.warehouse', 'warehouse')
            .leftJoinAndSelect('iv.location', 'location')
            .leftJoinAndSelect('iv.creator', 'creator')
            .leftJoinAndSelect('iv.updater', 'updater')
            .andWhere('iv.qty > 0')
            .andWhere('CASE WHEN iv.lockedQty IS NULL THEN 0 ELSE iv.lockedQty END >= 0')
            .andWhere('iv.qty - CASE WHEN iv.lockedQty IS NULL THEN 0 ELSE iv.lockedQty END > 0')
            .andWhere(`(iv.batch_id, product.name, iv.packing_type) NOT IN (
        SELECT 
          oi.batch_id, p2.name, oi.packing_type
        FROM 
          order_inventories oi
        LEFT JOIN
          products p2
        ON
          oi.product_id = p2.id
        WHERE 
          status = '${sales_base_1.ORDER_INVENTORY_STATUS.PENDING_SPLIT}'
        AND oi.bizplace_id IN (:...permittedBizplaceIds)
        AND oi.domain_id = (:domainId)
      )`, { permittedBizplaceIds, domainId: context.state.domain.id });
        if (((_a = sortings) === null || _a === void 0 ? void 0 : _a.length) !== 0) {
            const arrChildSortData = ['bizplace', 'product', 'location', 'warehouse', 'zone'];
            const sort = (sortings || []).reduce((acc, sort) => (Object.assign(Object.assign({}, acc), { [arrChildSortData.indexOf(sort.name) >= 0 ? sort.name + '.name' : 'iv.' + sort.name]: sort.desc
                    ? 'DESC'
                    : 'ASC' })), {});
            qb.orderBy(sort);
        }
        if (((_b = locationSortingRules) === null || _b === void 0 ? void 0 : _b.length) > 0) {
            locationSortingRules.forEach((rule) => {
                qb.addOrderBy(`location.${rule.name}`, rule.desc ? 'DESC' : 'ASC');
            });
        }
        let [items, total] = await qb.getManyAndCount();
        items = await Promise.all(items.map(async (item) => {
            const { remainQty, remainWeight } = await getRemainAmount(item);
            return Object.assign(Object.assign({}, item), { remainQty,
                remainWeight });
        }));
        return { items, total };
    }
};
async function getRemainAmount(inventory) {
    const orderInventories = await typeorm_1.getRepository(sales_base_1.OrderInventory).find({
        where: {
            inventory,
            status: typeorm_1.In([
                sales_base_1.ORDER_INVENTORY_STATUS.PENDING,
                sales_base_1.ORDER_INVENTORY_STATUS.PENDING_RECEIVE,
                sales_base_1.ORDER_INVENTORY_STATUS.READY_TO_PICK,
                sales_base_1.ORDER_INVENTORY_STATUS.PICKING,
                sales_base_1.ORDER_INVENTORY_STATUS.PENDING_SPLIT
            ])
        }
    });
    const { releaseQty, releaseWeight } = orderInventories.reduce((releaseAmount, orderInv) => {
        releaseAmount.releaseQty += orderInv.releaseQty;
        releaseAmount.releaseWeight += orderInv.releaseWeight;
        return releaseAmount;
    }, { releaseQty: 0, releaseWeight: 0 });
    return { remainQty: inventory.qty - releaseQty, remainWeight: inventory.weight - releaseWeight };
}
//# sourceMappingURL=inventories-by-pallet.js.map