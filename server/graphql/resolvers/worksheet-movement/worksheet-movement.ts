import { getRepository } from 'typeorm'
import { WorksheetMovement } from '../../../entities'

export const worksheetMovementResolver = {
  async worksheetMovement(_, { id }, context, info) {
    const repository = getRepository(WorksheetMovement)

    return await repository.findOne(
      { id }
    )
  }
}
