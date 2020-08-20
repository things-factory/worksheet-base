import { ArrivalNotice, ReleaseGood } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, FindOneOptions, getRepository, Repository } from 'typeorm'
import { WORKSHEET_TYPE } from '../../../constants'
import { Worksheet } from '../../../entities'

export const worksheetByOrderNoResolver = {
  async worksheetByOrderNo(
    _: any,
    { orderType, orderNo }: { orderType: string; orderNo: string },
    context: any
  ): Promise<Worksheet> {
    const domain: Domain = context.state.domain
    return await worksheetByOrderNo(domain, orderNo, orderType)
  }
}

export async function worksheetByOrderNo(
  domain: Domain,
  orderNo: string,
  type: string,
  trxMgr?: EntityManager
): Promise<Worksheet> {
  let findOption: FindOneOptions<Worksheet> = { where: { domain, type } }

  if (type === WORKSHEET_TYPE.UNLOADING || type === WORKSHEET_TYPE.PUTAWAY) {
    const ganRepo: Repository<ArrivalNotice> = trxMgr?.getRepository(ArrivalNotice) || getRepository(ArrivalNotice)
    findOption.where['arrivalNotice'] = await ganRepo.findOne({ domain, name: orderNo })
  } else if (type === WORKSHEET_TYPE.PICKING || type === WORKSHEET_TYPE.LOADING) {
    const roRepo: Repository<ReleaseGood> = trxMgr?.getRepository(ReleaseGood) || getRepository(ReleaseGood)
    findOption.where['releaseGood'] = await roRepo.findOne({ domain, name: orderNo })
  }

  const wsRepo: Repository<Worksheet> = trxMgr?.getRepository(Worksheet) || getRepository(Worksheet)
  return await wsRepo.findOne(findOption)
}
