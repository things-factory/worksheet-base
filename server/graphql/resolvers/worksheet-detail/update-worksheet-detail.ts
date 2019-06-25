import { getRepository } from 'typeorm'
import { WorksheetDetail } from '../../../entities'

export const updateWorksheetDetail = {
  async updateWorksheetDetail(_, { id, patch }) {
    const repository = getRepository(WorksheetDetail)

    const worksheetDetail = await repository.findOne({ id })

    return await repository.save({
      ...worksheetDetail,
      ...patch
    })
  }
}
