import { Bizplace } from '@things-factory/biz-base'
import { ArrivalNotice, ReleaseGood, VasOrder } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, FindOneOptions, getRepository, Repository } from 'typeorm'
import { WORKSHEET_STATUS } from '../constants'
import { Worksheet } from '../entities'

export async function fetchExecutingWorksheet(
  domain: Domain,
  bizplace: Bizplace,
  relations: string[],
  type: string,
  refOrder: ArrivalNotice | ReleaseGood | VasOrder,
  trxMgr?: EntityManager
): Promise<Worksheet> {
  const wsRepo: Repository<Worksheet> = trxMgr?.getRepository(Worksheet) || getRepository(Worksheet)
  const findOneOption: FindOneOptions = {
    where: {
      domain,
      bizplace,
      type
    },
    relations
  }

  if (refOrder instanceof ArrivalNotice) {
    findOneOption.where['arrivalNotice'] = refOrder
  } else if (refOrder instanceof ReleaseGood) {
    findOneOption.where['releaseGood'] = refOrder
  } else if (refOrder instanceof VasOrder) {
    findOneOption.where['vasOrder'] = refOrder
  }

  const worksheet: Worksheet = await wsRepo.findOne(findOneOption)
  if (!worksheet) throw new Error(`Couldn't find worksheet by order no (${refOrder.name})`)
  if (worksheet.status !== WORKSHEET_STATUS.EXECUTING) {
    throw new Error(`Worksheet is not activated yet`)
  }

  return worksheet
}
