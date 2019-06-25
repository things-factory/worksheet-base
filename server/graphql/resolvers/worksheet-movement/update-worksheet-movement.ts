import { getRepository } from 'typeorm'
import { WorksheetMovement } from '../../../entities'

export const updateWorksheetMovement = {
  async updateWorksheetMovement(_, { id, patch }) {
    const repository = getRepository(WorksheetMovement)

    const worksheetMovement = await repository.findOne({ id })

    return await repository.save({
      ...worksheetMovement,
      ...patch
    })
  }
}
