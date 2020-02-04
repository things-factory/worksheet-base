import { getPermittedBizplaceIds } from '@things-factory/biz-base'
import { getRepository, In } from 'typeorm'
import { Worksheet } from '../../../entities'

export const worksheetResolver = {
  async worksheet(_: any, { name }, context: any) {
    return await getRepository(Worksheet).findOne({
      where: {
        domain: context.state.domain,
        bizplace: In(await getPermittedBizplaceIds(context.state.domain, context.state.user)),
        name
      },
      relations: [
        'domain',
        'bizplace',
        'bufferLocation',
        'bufferLocation.warehouse',
        'arrivalNotice',
        'releaseGood',
        'vasOrder',
        'worksheetDetails',
        'worksheetDetails.toLocation',
        'worksheetDetails.targetProduct',
        'worksheetDetails.targetProduct.product',
        'worksheetDetails.targetVas',
        'worksheetDetails.targetVas.vas',
        'worksheetDetails.targetVas.inventory',
        'worksheetDetails.targetVas.inventory.location',
        'worksheetDetails.targetInventory',
        'worksheetDetails.targetInventory.inventory',
        'worksheetDetails.targetInventory.inventory.product',
        'worksheetDetails.targetInventory.inventory.warehouse',
        'worksheetDetails.targetInventory.inventory.location',
        'creator',
        'updater'
      ]
    })
  }
}
