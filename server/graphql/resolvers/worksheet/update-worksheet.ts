import { getPermittedBizplaceIds } from '@things-factory/biz-base'
import { getRepository, In } from 'typeorm'
import { Worksheet } from '../../../entities'

export const updateWorksheet = {
  async updateWorksheet(_: any, { id, patch }, context: any) {
    const worksheet: Worksheet = await getRepository(Worksheet).findOne({
      where: {
        domain: context.state.domain,
        bizplace: In(await getPermittedBizplaceIds(context.state.domain, context.state.user)),
        id
      }
    })

    return await getRepository(Worksheet).save({
      ...worksheet,
      ...patch,
      updater: context.state.user
    })
  }
}
