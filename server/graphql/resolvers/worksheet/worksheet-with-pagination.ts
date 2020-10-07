import { User } from '@things-factory/auth-base'
import { Domain } from '@things-factory/shell'
import { FindManyOptions, getRepository } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const worksheetWithPaginationResolver = {
  async worksheetWithPagination(
    _: any,
    { name, pagination }: { name: string; pagination?: { page: number; limit: number } },
    context: any
  ): Promise<{ worksheet: Worksheet; worksheetDetails: WorksheetDetail[]; total: number }> {
    const { domain, user }: { domain: Domain; user: User } = context.state
    const worksheet: Worksheet = await getRepository(Worksheet).findOne({
      where: { domain, name },
      relations: ['bizplace', 'arrivalNotice', 'releaseGood', 'inventoryCheck']
    })

    let findManyOptions: FindManyOptions<WorksheetDetail> = {
      where: { domain, worksheet },
      relations: [
        'targetInventory',
        'targetInventory.inspectedLocation',
        'targetInventory.inventory',
        'targetInventory.inventory.location',
        'targetInventory.inventory.product'
      ]
    }

    if (pagination?.page && pagination?.limit) {
      const { page, limit }: { page: number; limit: number } = pagination
      const offset: number = (page - 1) * limit
      findManyOptions.skip = offset
      findManyOptions.take = limit
    }

    const [worksheetDetails, total] = await getRepository(WorksheetDetail).findAndCount(findManyOptions)

    return {
      worksheet,
      worksheetDetails,
      total
    }
  }
}
