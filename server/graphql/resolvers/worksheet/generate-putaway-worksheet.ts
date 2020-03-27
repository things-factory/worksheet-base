import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import {
  ArrivalNotice,
  OrderInventory,
  OrderNoGenerator,
  ORDER_PRODUCT_STATUS,
  ORDER_TYPES
} from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory, Location } from '@things-factory/warehouse-base'
import { EntityManager, getManager, getRepository, Repository } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { WorksheetNoGenerator } from '../../../utils'

export const generatePutawayWorksheetResolver = {
  async generatePutawayWorksheet(_: any, { arrivaNoticeNo, inventories }, context: any): Promise<void> {
    return await getManager().transaction(async trxMgr => {
      const arrivalNotice: ArrivalNotice = await trxMgr.getRepository(ArrivalNotice).findOne({
        where: {
          domain: context.state.domain,
          name: arrivaNoticeNo
        },
        relations: ['bizplace']
      })

      await generatePutawayWorksheet(context.state.domain, arrivalNotice, inventories, context.state.user, trxMgr)
    })
  }
}

export async function generatePutawayWorksheet(
  domain: Domain,
  arrivalNotice: ArrivalNotice,
  inventories: Inventory[],
  user: User,
  trxMgr?: EntityManager
): Promise<Worksheet> {
  const ganRepo: Repository<ArrivalNotice> = trxMgr?.getRepository(ArrivalNotice) || getRepository(ArrivalNotice)
  const worksheetRepo: Repository<Worksheet> = trxMgr?.getRepository(Worksheet) || getRepository(Worksheet)
  const ordInvRepo: Repository<OrderInventory> = trxMgr?.getRepository(OrderInventory) || getRepository(OrderInventory)
  const worksheetDetailRepo: Repository<WorksheetDetail> =
    trxMgr?.getRepository(WorksheetDetail) || getRepository(WorksheetDetail)

  if (!arrivalNotice?.id) throw new Error(`Can't find gan id`)
  if (!arrivalNotice?.bizplace?.id) {
    arrivalNotice = await ganRepo.findOne(arrivalNotice.id, {
      relations: ['bizplace']
    })
  }

  const bizplace: Bizplace = arrivalNotice.bizplace
  const unloadingWorksheet: Worksheet = await worksheetRepo.findOne({
    where: { arrivalNotice, type: WORKSHEET_TYPE.UNLOADING },
    relations: ['bufferLocatoin']
  })
  const bufferLocation: Location = unloadingWorksheet.bufferLocation

  const putawayWorksheet: Worksheet = await worksheetRepo.save({
    domain,
    arrivalNotice,
    bizplace,
    name: WorksheetNoGenerator.putaway(),
    type: WORKSHEET_TYPE.PUTAWAY,
    status: WORKSHEET_STATUS.DEACTIVATED,
    bufferLocatoin: unloadingWorksheet.bufferLocation,
    creator: user,
    updater: user
  })

  await Promise.all(
    inventories.map(async (inventory: Inventory) => {
      const targetInventory: OrderInventory = await ordInvRepo.save({
        domain,
        bizplace,
        name: OrderNoGenerator.OrderInventory(),
        releaseQty: inventory.qty,
        status: ORDER_PRODUCT_STATUS.UNLOADED,
        type: ORDER_TYPES.ARRIVAL_NOTICE,
        arrivalNotice,
        inventory,
        creator: user,
        updater: user
      })

      await worksheetDetailRepo.save({
        domain,
        bizplace,
        name: WorksheetNoGenerator.putawayDetail(),
        worksheet: putawayWorksheet,
        targetInventory,
        fromLocation: bufferLocation,
        status: WORKSHEET_STATUS.DEACTIVATED,
        creator: user,
        updater: user
      })
    })
  )

  return await worksheetRepo.findOne(putawayWorksheet.id, { relations: ['arrivalNotice', 'worksheetDetails'] })
}
