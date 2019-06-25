import { getRepository } from 'typeorm'
import { WorksheetDetail } from '../../../entities'

export const deleteWorksheetDetail = {
  async deleteWorksheetDetail(_, { id }) {
    const repository = getRepository(WorksheetDetail)

    return await repository.delete(id)
  }
}
