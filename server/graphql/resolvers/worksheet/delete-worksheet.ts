import { getRepository, In } from 'typeorm'
import { Worksheet } from '../../../entities'

export const deleteWorksheet = {
  async deleteWorksheet(_: any, { name }, context: any) {
    await getRepository(Worksheet).delete({
      domain: context.state.domain,
      bizplace: In(context.state.bizplaces),
      name
    })

    return true
  }
}
