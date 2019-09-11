import { getRepository, In } from 'typeorm'
import { Worksheet } from '../../../entities'

export const worksheetResolver = {
  async worksheet(_: any, { name }, context: any) {
    return await getRepository(Worksheet).findOne({
      where: {
        domain: context.state.domain,
        bizplace: In(context.state.bizplaces),
        name
      },
      relations: ['domain', 'bizplace', 'worksheetDetails', 'creator', 'updater']
    })
  }
}
