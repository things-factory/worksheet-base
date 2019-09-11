import { getRepository } from 'typeorm'
import { Worksheet } from '../../../entities'

export const createWorksheet = {
  async createWorksheet(_: any, { worksheet }, context: any) {
    return await getRepository(Worksheet).save({
      ...worksheet,
      domain: context.state.domain,
      bizplace: context.state.bizplace[0],
      creator: context.state.user,
      updater: context.state.user
    })
  }
}
