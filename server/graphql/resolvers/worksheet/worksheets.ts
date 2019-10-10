import { Bizplace } from '@things-factory/biz-base'
import { convertListParams, ListParam } from '@things-factory/shell'
import { getRepository, In } from 'typeorm'
import { Worksheet } from '../../../entities'

export const worksheetsResolver = {
  async worksheets(_: any, params: ListParam, context: any) {
    const convertedParams = convertListParams(params)
    convertedParams.where.bizplace = In(context.state.bizplaces.map((bizplace: Bizplace) => bizplace.id))

    const [items, total] = await getRepository(Worksheet).findAndCount({
      ...convertedParams,
      relations: [
        'domain',
        'bizplace',
        'arrivalNotice',
        'releaseGood',
        'vasOrder',
        'worksheetDetails',
        'worksheetDetails.targetProduct',
        'worksheetDetails.targetProduct.product',
        'worksheetDetails.targetVas',
        'worksheetDetails.targetVas.vas',
        'creator',
        'updater'
      ]
    })

    return { items, total }
  }
}
