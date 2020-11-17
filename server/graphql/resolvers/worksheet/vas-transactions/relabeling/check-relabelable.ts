import { User } from '@things-factory/auth-base'
import { Bizplace, getMyBizplace } from '@things-factory/biz-base'
import { Product } from '@things-factory/product-base'
import { Domain } from '@things-factory/shell'
import { Inventory, INVENTORY_STATUS } from '@things-factory/warehouse-base'
import { Equal, getRepository, Not } from 'typeorm'

export const checkRelabelableResolver = {
  async checkRelabelable(
    _: void,
    {
      batchId,
      productId,
      packingType,
      unitStdUnitValue
    }: { batchId: string; productId: string; packingType: string; unitStdUnitValue: number },
    context: any
  ): Promise<boolean> {
    const domain: Domain = context.state.domain
    const user: User = context.state.user
    const bizplace: Bizplace = await getMyBizplace(user)
    const product: Product = await getRepository(Product).findOne({
      where: { domain, bizplace, id: productId }
    })
    if (!product) throw new Error(`Couldn't find product by ID (${productId})`)

    return await checkRelabelable(domain, bizplace, batchId, product, packingType, unitStdUnitValue)
  }
}

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
 * @param {Number} unitStdUnitValue
 */
export async function checkRelabelable(
  domain: Domain,
  bizplace: Bizplace,
  batchId: string,
  product: Product,
  packingType: string,
  unitStdUnitValue: number
): Promise<boolean> {
  // Try to find out identical inventory
  // The condition is same batch id same product same packing type same stdUnitValue
  // If there *IS* identical inventory the target inventory for this vas can be executed
  const identicalInvCnt: number = await getRepository(Inventory)
    .createQueryBuilder('inv')
    .where('inv.domain_id = :domainId')
    .andWhere('inv.bizplace_id = :bizplaceId')
    .andWhere('inv.batch_id = :batchId')
    .andWhere('inv.product_id = :productId')
    .andWhere('inv.packing_type = :packingType')
    .andWhere('inv.status != :status')
    .andWhere('(inv.std_unit_value / inv.qty) = :unitStdUnitValue')
    .setParameters({
      domainId: domain.id,
      bizplaceId: bizplace.id,
      batchId,
      productId: product.id,
      packingType,
      status: INVENTORY_STATUS.TERMINATED,
      unitStdUnitValue
    })
    .getCount()

  if (identicalInvCnt) return true

  // Try to find out duplicated invenetory
  // The condition is same batch id same product same packing type
  // If there's *NO* duplicated inventory the target inventory for this vas can be executed
  const duplicatedInvCnt: number = await getRepository(Inventory).count({
    where: { domain, bizplace, batchId, product, packingType, status: Not(Equal(INVENTORY_STATUS.TERMINATED)) }
  })
  if (!duplicatedInvCnt) return true

  return false
}
