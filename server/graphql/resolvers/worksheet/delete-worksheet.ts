import { getRepository } from 'typeorm'
import { Worksheet } from '../../../entities'

export const deleteWorksheet = {
  async deleteWorksheet(_, { id }) {
    const repository = getRepository(Worksheet)

    return await repository.delete(id)
  }
}
