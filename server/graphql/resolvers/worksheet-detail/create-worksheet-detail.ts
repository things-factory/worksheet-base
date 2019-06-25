import uuid from 'uuid/v4'

import { getRepository } from 'typeorm'
import { WorksheetDetail } from '../../../entities'

export const createWorksheetDetail = {
  async createWorksheetDetail(_, { worksheetDetail: attrs }) {
    const repository = getRepository(WorksheetDetail)
    const newWorksheetDetail = {
      id: uuid(),
      ...attrs
    }

    return await repository.save(newWorksheetDetail)
  }
}
