import { getPermittedBizplaceIds } from '@things-factory/biz-base'
import { getRepository, In } from 'typeorm'
import { Worksheet } from '../../../entities'

export const deleteWorksheet = {
  async deleteWorksheet(_: any, { id }, context: any) {
    await getRepository(Worksheet).delete({
      domain: context.state.domain,
      bizplace: In(await getPermittedBizplaceIds(context.state.domain, context.state.user)),
      id
    })

    return true
  }
}
