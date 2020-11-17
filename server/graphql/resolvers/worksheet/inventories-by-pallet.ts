import { getPermittedBizplaceIds } from '@things-factory/biz-base'
import { OrderInventory, ORDER_INVENTORY_STATUS } from '@things-factory/sales-base'
import { buildQuery } from '@things-factory/shell'
import { Inventory } from '@things-factory/warehouse-base'
import { getRepository, In, SelectQueryBuilder } from 'typeorm'

export const inventoriesByPalletResolver = {
  async inventoriesByPallet(_: any, { filters, pagination, sortings, locationSortingRules }, context: any) {
    const params = { filters, pagination }
    let permittedBizplaceIds: string[] = await getPermittedBizplaceIds(context.state.domain, context.state.user)

    if (!params.filters.find((filter: any) => filter.name === 'bizplace')) {
      params.filters.push({
        name: 'bizplace',
        operator: 'in',
        value: permittedBizplaceIds,
        relation: true
      })
    } else {
      permittedBizplaceIds = params.filters.find(filter => filter.name === 'bizplace').value
      params.filters.find(filter => filter.name === 'bizplace').relation = true
    }

    const qb: SelectQueryBuilder<Inventory> = getRepository(Inventory).createQueryBuilder('iv')
    buildQuery(qb, params, context)

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
      .andWhere(
        `(iv.batch_id, product.name, iv.packing_type) NOT IN (
        SELECT 
          oi.batch_id, p2.name, oi.packing_type
        FROM 
          order_inventories oi
        LEFT JOIN
          products p2
        ON
          oi.product_id = p2.id
        WHERE 
          status = '${ORDER_INVENTORY_STATUS.PENDING_SPLIT}'
        AND oi.bizplace_id IN (:...permittedBizplaceIds)
        AND oi.domain_id = (:domainId)
      )`,
        { permittedBizplaceIds, domainId: context.state.domain.id }
      )

    if (sortings?.length !== 0) {
      const arrChildSortData = ['bizplace', 'product', 'location', 'warehouse', 'zone']
      const sort = (sortings || []).reduce(
        (acc, sort) => ({
          ...acc,
          [arrChildSortData.indexOf(sort.name) >= 0 ? sort.name + '.name' : 'iv.' + sort.name]: sort.desc
            ? 'DESC'
            : 'ASC'
        }),
        {}
      )
      qb.orderBy(sort)
    }

    if (locationSortingRules?.length > 0) {
      locationSortingRules.forEach((rule: { name: string; desc: boolean }) => {
        qb.addOrderBy(`location.${rule.name}`, rule.desc ? 'DESC' : 'ASC')
      })
    }

    let [items, total] = await qb.getManyAndCount()

    items = await Promise.all(
      items.map(async (item: Inventory) => {
        const { remainQty, remainStdUnitValue } = await getRemainAmount(item)

        return {
          ...item,
          remainQty,
          remainStdUnitValue
        }
      })
    )

    return { items, total }
  }
}

async function getRemainAmount(inventory: Inventory): Promise<{ remainQty: number; remainStdUnitValue: number }> {
  return {
    remainQty: inventory.qty - inventory.lockedQty,
    remainStdUnitValue: inventory.stdUnitValue - inventory.lockedStdUnitValue
  }
}
