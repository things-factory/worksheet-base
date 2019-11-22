import { Bizplace, getPermittedBizplaceIds } from '@things-factory/biz-base'
import { ArrivalNotice, ReleaseGood } from '@things-factory/sales-base'
import { convertListParams, ListParam } from '@things-factory/shell'
import { getRepository, In, IsNull } from 'typeorm'
import { Worksheet } from '../../../entities'

export const worksheetsResolver = {
  async worksheets(_: any, params: ListParam, context: any) {
    const convertedParams = convertListParams(params)

    const arrivalNoticeParam: any = params.filters.find((param: any) => param.name === 'arrivalNoticeNo')
    const arrivalNoticeRefNoParam = params.filters.find(param => param.name === 'arrivalNoticeRefNo')
    if (arrivalNoticeParam || arrivalNoticeRefNoParam) {
      let arrFilters = []
      if (arrivalNoticeParam) arrFilters.push({ ...arrivalNoticeParam, name: 'name' })
      if (arrivalNoticeRefNoParam) arrFilters.push({ ...arrivalNoticeRefNoParam, name: 'refNo' })
      const foundArrivalNotices: ArrivalNotice[] = await getRepository(ArrivalNotice).find({
        ...convertListParams({ filters: arrFilters })
      })
      if (foundArrivalNotices && foundArrivalNotices.length) {
        convertedParams.where.arrivalNotice = In(foundArrivalNotices.map((foundAN: ArrivalNotice) => foundAN.id))
      } else {
        convertListParams.where.arrivalNotice = IsNull()
      }
    }

    const releaseGoodParam = params.filters.find(param => param.name === 'releaseGoodNo')
    const releaseGoodRefNoParam = params.filters.find(param => param.name === 'releaseGoodRefNo')
    if (releaseGoodParam || releaseGoodRefNoParam) {
      let arrFilters = []
      if (releaseGoodParam) arrFilters.push({ ...releaseGoodParam, name: 'name' })
      if (releaseGoodRefNoParam) arrFilters.push({ ...releaseGoodRefNoParam, name: 'refNo' })
      const foundReleaseGoods: ReleaseGood[] = await getRepository(ReleaseGood).find({
        ...convertListParams({ filters: arrFilters })
      })
      if (foundReleaseGoods && foundReleaseGoods.length) {
        convertedParams.where.releaseGood = In(foundReleaseGoods.map((foundRG: ReleaseGood) => foundRG.id))
      } else {
        convertListParams.where.releaseGood = IsNull()
      }
    }

    const bizplaceParam = params.filters.find(param => param.name === 'bizplaceName')
    if (bizplaceParam) {
      const foundBizplaces: Bizplace[] = await getRepository(Bizplace).find({
        where: {
          ...convertListParams({ filters: [{ ...bizplaceParam, name: 'name' }] }).where,
          bizplace: In(await getPermittedBizplaceIds(context.state.domain, context.state.user))
        }
      })
      if (foundBizplaces && foundBizplaces.length) {
        convertedParams.where.bizplace = In(foundBizplaces.map((foundBizplace: Bizplace) => foundBizplace.id))
      } else {
        convertedParams.where.bizplace = IsNull()
      }
    } else {
      convertedParams.where.bizplace = In(await getPermittedBizplaceIds(context.state.domain, context.state.user))
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
