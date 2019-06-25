import uuid from 'uuid/v4'

import { getRepository } from 'typeorm'
import { Worksheet } from '../../../entities'

export const createWorksheet = {
  async createWorksheet(_, { worksheet: attrs }) {
    const repository = getRepository(Worksheet)
    const newWorksheet = {
      id: uuid(),
      ...attrs
    }

    return await repository.save(newWorksheet)
  }
}
