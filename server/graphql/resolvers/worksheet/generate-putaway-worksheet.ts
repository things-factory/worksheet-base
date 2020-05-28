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
import { Inventory, INVENTORY_STATUS, Location } from '@things-factory/warehouse-base'
import { EntityManager, getManager, getRepository, Repository } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { WorksheetNoGenerator } from '../../../utils'

export const generatePutawayWorksheetResolver = {
  async generatePutawayWorksheet(_: any, { arrivalNoticeNo, inventories }, context: any): Promise<void> {
    return await getManager().transaction(async trxMgr => {
      const arrivalNotice: ArrivalNotice = await trxMgr.getRepository(ArrivalNotice).findOne({
        where: {
          domain: context.state.domain,
          name: arrivalNoticeNo
        },
        relations: ['bizplace']
      })

      await generatePutawayWorksheet(context.state.domain, arrivalNotice, inventories, context.state.user, trxMgr)
      const unloadingWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
        where: { arrivalNotice, type: WORKSHEET_TYPE.UNLOADING },
        relations: [
          'worksheetDetails',
          'worksheetDetails.targetInventory',
          'worksheetDetails.targetInventory.inventory'
        ]
      })
      const worksheetDetails: WorksheetDetail[] = unloadingWorksheet.worksheetDetails
      await Promise.all(
        worksheetDetails.map(async (wsd: WorksheetDetail) => {
          if (wsd?.targetInventory?.inventory?.status !== INVENTORY_STATUS.PARTIALLY_UNLOADED) {
            await trxMgr.getRepository(WorksheetDetail).save({
              ...wsd,
              status: WORKSHEET_STATUS.EXECUTING,
              updater: context.state.user
            })
          }
        })
      )
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
  const invRepo: Repository<Inventory> = trxMgr?.getRepository(Inventory) || getRepository(Inventory)

  if (!arrivalNotice?.id) throw new Error(`Can't find gan id`)
  if (!arrivalNotice?.bizplace?.id) {
    arrivalNotice = await ganRepo.findOne(arrivalNotice.id, {
      relations: ['bizplace']
    })
  }

  const bizplace: Bizplace = arrivalNotice.bizplace
  const unloadingWorksheet: Worksheet = await worksheetRepo.findOne({
    where: { arrivalNotice, type: WORKSHEET_TYPE.UNLOADING },
    relations: ['bufferLocation']
  })
  const bufferLocation: Location = unloadingWorksheet.bufferLocation

  // Check whether putaway worksheet is exists or not
  // If it's exists append new worksheet details into the putaway worksheet
  // If it's not exists create new putaway worksheet
  let putawayWorksheet: Worksheet = await worksheetRepo.findOne({
    where: {
      domain,
      arrivalNotice,
      bizplace,
      type: WORKSHEET_TYPE.PUTAWAY
    }
  })

  let wsdStatus: string = WORKSHEET_STATUS.EXECUTING
  if (!putawayWorksheet) {
    wsdStatus = WORKSHEET_STATUS.DEACTIVATED
    putawayWorksheet = await worksheetRepo.save({
      domain,
      arrivalNotice,
      bizplace,
      name: WorksheetNoGenerator.putaway(),
      type: WORKSHEET_TYPE.PUTAWAY,
      status: WORKSHEET_STATUS.DEACTIVATED,
      bufferLocation: unloadingWorksheet.bufferLocation,
      creator: user,
      updater: user
    })
  }

  await Promise.all(
    inventories.map(async (inventory: Inventory) => {
      await invRepo.save({
        ...inventory,
        status: INVENTORY_STATUS.PUTTING_AWAY,
        updater: user
      })

      const targetInventory: OrderInventory = await ordInvRepo.save({
        domain,
        bizplace,
        name: OrderNoGenerator.orderInventory(),
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
        type: WORKSHEET_TYPE.PUTAWAY,
        targetInventory,
        fromLocation: bufferLocation,
        status: wsdStatus,
        creator: user,
        updater: user
      })
    })
  )

  return await worksheetRepo.findOne(putawayWorksheet.id, { relations: ['arrivalNotice', 'worksheetDetails'] })
}
