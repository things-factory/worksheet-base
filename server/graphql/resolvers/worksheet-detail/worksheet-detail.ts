import { getRepository } from 'typeorm'
import { WorksheetDetail } from '../../../entities'

export const worksheetDetailResolver = {
  async worksheetDetail(_, { id }, context, info) {
    const repository = getRepository(WorksheetDetail)

    return await repository.findOne(
      { id }
    )
  }
}
