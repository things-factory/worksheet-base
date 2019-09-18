import { Bizplace } from '@things-factory/sales-base'
import { getRepository, In } from 'typeorm'
import { Worksheet } from '../../../entities'

export const worksheetResolver = {
  async worksheet(_: any, { name }, context: any) {
    return await getRepository(Worksheet).findOne({
      where: {
        domain: context.state.domain,
        bizplace: In(context.state.bizplaces.map((bizplace: Bizplace) => bizplace.id)),
        name
      },
      relations: [
        'domain',
        'bizplace',
        'worksheetDetails',
        'worksheetDetails.targetProduct',
        'worksheetDetails.targetProduct.product',
        'worksheetDetails.targetVas',
        'worksheetDetails.targetVas.vas',
        'creator',
        'updater'
      ]
    })
  }
}
