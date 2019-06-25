import { getRepository } from 'typeorm'
import { Worksheet } from '../../../entities'

export const worksheetResolver = {
  async worksheet(_, { id }, context, info) {
    const repository = getRepository(Worksheet)

    return await repository.findOne(
      { id }
    )
  }
}
