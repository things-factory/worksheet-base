import { buildQuery, ListParam } from '@things-factory/shell'
import { getRepository } from 'typeorm'
import { WorksheetMovement } from '../../../entities'

export const worksheetMovementsResolver = {
  async worksheetMovements(_: any, params: ListParam, context: any) {
    const queryBuilder = getRepository(WorksheetMovement).createQueryBuilder()
    buildQuery(queryBuilder, params)
    const [items, total] = await queryBuilder.getManyAndCount()

    return { items, total }
  }
}
