import { getPermittedBizplaceIds } from '@things-factory/biz-base'
import { convertListParams, ListParam } from '@things-factory/shell'
import { getRepository, In } from 'typeorm'
import { WorksheetDetail } from '../../../entities'

export const worksheetDetailsResolver = {
  async worksheetDetails(_: any, params: ListParam, context: any) {
    const convertedParams = convertListParams(params)
    convertedParams.where.bizplace = In(await getPermittedBizplaceIds(context.state.domain, context.state.user))

    const [items, total] = await getRepository(WorksheetDetail).findAndCount({
      ...convertedParams,
      relations: ['domain', 'bizplace', 'worksheet', 'worker', 'targetProduct', 'targetVas', 'creator', 'updater']
    })

    return { items, total }
  }
}
