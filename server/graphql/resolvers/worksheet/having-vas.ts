import { ArrivalNotice, ORDER_TYPES, ReleaseGood } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getRepository, Repository, FindOneOptions } from 'typeorm'
import { Worksheet } from '../../../entities'

export const havingVasResolver = {
  async havingVas(_: any, { orderType, orderNo }, context: any): Promise<Worksheet> {
    return await havingVas(orderType, orderNo, context)
  }
}

export async function havingVas(orderType: string, orderNo: string, context: any, trxMgr?: EntityManager) {
  const ganRepo: Repository<ArrivalNotice> = trxMgr?.getRepository(ArrivalNotice) || getRepository(ArrivalNotice)
  const roRepo: Repository<ReleaseGood> = trxMgr?.getRepository(ReleaseGood) || getRepository(ReleaseGood)
  const wsRepo: Repository<Worksheet> = trxMgr?.getRepository(Worksheet) || getRepository(Worksheet)

  const domain: Domain = context.state.domain

  const orderFindOptions: FindOneOptions<ArrivalNotice | ReleaseGood> = {
    where: { domain, name: orderNo }
  }
  let wsFindOptions: FindOneOptions<Worksheet> = {
    where: { domain }
  }

  if (orderType === ORDER_TYPES.ARRIVAL_NOTICE) {
    const arrivalNotice: ArrivalNotice = await ganRepo.findOne(orderFindOptions)
    if (!arrivalNotice) throw new Error(`Failed to find arrival notice with passed order no (${orderNo})`)
    wsFindOptions.where['arrivalNotice'] = arrivalNotice
  } else if (orderType === ORDER_TYPES.RELEASE_OF_GOODS) {
    const releaseGood: ReleaseGood = await roRepo.findOne(orderFindOptions)
    if (!releaseGood) throw new Error(`Failed to find release of goods with passed order no (${orderNo})`)
    wsFindOptions.where['releaseGood'] = releaseGood
  } else {
    throw new Error(`Order type (${orderType}) is not target to check about having VAS`)
  }

  return await wsRepo.findOne(wsFindOptions)
}
