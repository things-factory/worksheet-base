import { Bizplace } from '@things-factory/biz-base'
import { ArrivalNotice, ReleaseGood } from '@things-factory/sales-base'
import { convertListParams, ListParam } from '@things-factory/shell'
import { getRepository, In } from 'typeorm'
import { Worksheet } from '../../../entities'

export const worksheetsResolver = {
  async worksheets(_: any, params: ListParam, context: any) {
    const convertedParams = convertListParams(params)

    const arrivalNoticeParam: any = params.find((param: any) => param.name === 'arrivalNoticeNo')
    if (arrivalNoticeParam) {
      const foundArrivalNotices: ArrivalNotice[] = await getRepository(ArrivalNotice).find({
        ...convertListParams({ filters: [{ ...arrivalNoticeParam, name: 'name' }] })
      })
      if (foundArrivalNotices && foundArrivalNotices.length) {
        convertedParams.where.arrivalNotice = In(foundArrivalNotices.map((foundAN: ArrivalNotice) => foundAN.id))
      }
    }

    const releaseGoodParam = params.find(param => param.name === 'releaseGoodNo')
    if (releaseGoodParam) {
      const foundReleaseGoods: ReleaseGood[] = await getRepository(ReleaseGood).find({
        ...convertListParams({ filters: [{ ...releaseGoodParam, name: 'name' }] })
      })
      if (foundReleaseGoods && foundReleaseGoods.length) {
        convertedParams.where.releaseGood = In(foundReleaseGoods.map((foundRG: ReleaseGood) => foundRG.id))
      }
    }

    const bizplaceParam = params.find(param => param.name === 'bizplaceName')
    if (bizplaceParam) {
      const foundBizplaces: Bizplace[] = await getRepository(Bizplace).find({
        where: {
          ...convertListParams({ filters: [{ ...bizplaceParam, name: 'name' }] }),
          bizplace: In(context.state.bizplaces.map((bizplace: Bizplace) => bizplace.id))
        }
      })
      if (foundBizplaces && foundBizplaces.length) {
        convertedParams.where.bizplace = In(foundBizplaces.map((foundBizplace: Bizplace) => foundBizplace.id))
      } else {
        convertedParams.where.bizplace = In(context.state.bizplaces.map((bizplace: Bizplace) => bizplace.id))
      }
    } else {
      convertedParams.where.bizplace = In(context.state.bizplaces.map((bizplace: Bizplace) => bizplace.id))
    }

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
