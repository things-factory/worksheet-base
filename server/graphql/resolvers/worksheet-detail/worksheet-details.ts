import { buildQuery, ListParam } from '@things-factory/shell'
import { getRepository } from 'typeorm'
import { WorksheetDetail } from '../../../entities'

export const worksheetDetailsResolver = {
  async worksheetDetails(_: any, params: ListParam, context: any) {
    const queryBuilder = getRepository(WorksheetDetail).createQueryBuilder()
    buildQuery(queryBuilder, params)
    const [items, total] = await queryBuilder.getManyAndCount()

    return { items, total }
  }
}