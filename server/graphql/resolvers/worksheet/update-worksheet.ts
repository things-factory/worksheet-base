import { In, getRepository } from 'typeorm'
import { Worksheet } from '../../../entities'

export const updateWorksheet = {
  async updateWorksheet(_: any, { name, patch }, context: any) {
    const worksheet: Worksheet = await getRepository(Worksheet).findOne({
      where: { domain: context.state.domain, bizplace: In(context.state.bizplaces), name }
    })

    return await getRepository(Worksheet).save({
      ...worksheet,
      ...patch,
      updater: context.state.user
    })
  }
}
