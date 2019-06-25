import { getRepository } from 'typeorm'
import { Worksheet } from '../../../entities'

export const updateWorksheet = {
  async updateWorksheet(_, { id, patch }) {
    const repository = getRepository(Worksheet)

    const worksheet = await repository.findOne({ id })

    return await repository.save({
      ...worksheet,
      ...patch
    })
  }
}
