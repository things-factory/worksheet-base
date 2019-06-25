import uuid from 'uuid/v4'

import { getRepository } from 'typeorm'
import { WorksheetMovement } from '../../../entities'

export const createWorksheetMovement = {
  async createWorksheetMovement(_, { worksheetMovement: attrs }) {
    const repository = getRepository(WorksheetMovement)
    const newWorksheetMovement = {
      id: uuid(),
      ...attrs
    }

    return await repository.save(newWorksheetMovement)
  }
}
