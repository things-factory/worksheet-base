import { SelectQueryBuilder, getRepository } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const worksheetDetailsByProductGroupResolver = {
  async worksheetDetailsByProductGroup(_: any, { worksheetId, batchId, productName, packingType }, context: any) {
    const worksheet: Worksheet = await getRepository(Worksheet).findOne({
      where: { id: worksheetId },
      relations: ['bizplace']
    })
    if (!worksheet) throw new Error(`Couldn't find worksheet`)
    const bizplaceId: string = worksheet?.bizplace?.id
    if (!bizplaceId) throw new Error(`Couldn't find bizplace id`)

    const qb: SelectQueryBuilder<WorksheetDetail> = getRepository(WorksheetDetail).createQueryBuilder('WSD')
    const [items, total] = await qb
      .leftJoin('WSD.targetInventory', 'ORD_INV')
      .andWhere('"WSD"."domain_id" = :domainId')
      .andWhere('"WSD"."bizplace_id" = :bizplaceId')
      .andWhere('"ORD_INV"."batch_id" = :batchId')
      .andWhere('"ORD_INV"."productName" = :productName')
      .andWhere('"ORD_INV"."packingType" = :packingType')
      .setParameters({
        domainId: context.state.domain.id,
        bizplaceId,
        batchId,
        productName,
        packingType
      })
      .getManyAndCount()

    return {
      items,
      total
    }
  }
}
