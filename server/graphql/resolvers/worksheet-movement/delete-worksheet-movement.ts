import { getRepository } from 'typeorm'
import { WorksheetMovement } from '../../../entities'

export const deleteWorksheetMovement = {
  async deleteWorksheetMovement(_, { id }) {
    const repository = getRepository(WorksheetMovement)

    return await repository.delete(id)
  }
}
