import { Bizplace } from '@things-factory/biz-base'
import { convertListParams, ListParam } from '@things-factory/shell'
import { getRepository, In } from 'typeorm'
import { WorksheetDetail } from '../../../entities'

export const worksheetDetailsResolver = {
  async worksheetDetails(_: any, params: ListParam, context: any) {
    const convertedParams = convertListParams(params)
    convertedParams.where.bizplace = In(context.state.bizplaces.map((bizplace: Bizplace) => bizplace.id))

    const [items, total] = await getRepository(WorksheetDetail).findAndCount({
      ...convertedParams,
      relations: [
        'domain',
        'bizplace',
        'worksheet',
        'worker',
        'fromLocation',
        'toLocation',
        'targetProduct',
        'targetVas',
        'creator',
        'updater'
      ]
    })

    return { items, total }
  }
}
