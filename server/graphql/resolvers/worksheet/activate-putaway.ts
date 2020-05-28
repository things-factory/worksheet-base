import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import { ArrivalNotice, OrderInventory, ORDER_PRODUCT_STATUS, ORDER_STATUS } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, getManager, getRepository, Repository, Not, Equal } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'

export const activatePutawayResolver = {
  async activatePutaway(_: any, { worksheetNo, putawayWorksheetDetails }, context: any) {
    return await getManager().transaction(async (trxMgr: EntityManager) => {
      const domain: Domain = context.state.domain
      const foundWorksheet: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
        where: {
          domain,
          name: worksheetNo,
          status: WORKSHEET_STATUS.DEACTIVATED,
          type: WORKSHEET_TYPE.PUTAWAY
        },
        relations: ['bizplace', 'arrivalNotice', 'worksheetDetails', 'worksheetDetails.targetInventory']
      })

      if (!foundWorksheet) throw new Error(`Worksheet doesn't exists`)

      const relatedWorksheetCnt: number = await trxMgr.getRepository(Worksheet).count({
        where: {
          domain,
          arrivalNotice: foundWorksheet.arrivalNotice,
          type: WORKSHEET_TYPE.VAS,
          status: Not(Equal(WORKSHEET_STATUS.DONE))
        }
      })

      if (relatedWorksheetCnt) {
        throw new Error(`Related VAS order with GAN: ${foundWorksheet.arrivalNotice.name} is still under processing.`)
      }

      return await activatePutaway(
        worksheetNo,
        putawayWorksheetDetails,
        context.state.domain,
        context.state.user,
        trxMgr
      )
    })
  }
}

export async function activatePutaway(
  worksheetNo: string,
  putawayWorksheetDetails: WorksheetDetail[],
  domain: Domain,
  user: User,
  trxMgr?: EntityManager
) {
  const wsRepo: Repository<Worksheet> = trxMgr?.getRepository(Worksheet) || getRepository(Worksheet)
  const wsdRepo: Repository<WorksheetDetail> = trxMgr?.getRepository(WorksheetDetail) || getRepository(WorksheetDetail)
  const oiRepo: Repository<OrderInventory> = trxMgr?.getRepository(OrderInventory) || getRepository(OrderInventory)
  const ganRepo: Repository<ArrivalNotice> = trxMgr?.getRepository(ArrivalNotice) || getRepository(ArrivalNotice)

  const foundWorksheet: Worksheet = await wsRepo.findOne({
    where: {
      domain,
      name: worksheetNo,
      status: WORKSHEET_STATUS.DEACTIVATED,
      type: WORKSHEET_TYPE.PUTAWAY
    },
    relations: ['bizplace', 'arrivalNotice', 'worksheetDetails', 'worksheetDetails.targetInventory']
  })

  if (!foundWorksheet) throw new Error(`Worksheet doesn't exists`)

  const relatedWorksheetCnt: number = await wsRepo.count({
    where: {
      domain,
      arrivalNotice: foundWorksheet.arrivalNotice,
      type: WORKSHEET_TYPE.VAS,
      status: Not(Equal(WORKSHEET_STATUS.DONE))
    }
  })

  if (relatedWorksheetCnt) return

  const customerBizplace: Bizplace = foundWorksheet.bizplace
  const foundWSDs: WorksheetDetail[] = foundWorksheet.worksheetDetails
  let targetInventories: OrderInventory[] = foundWSDs.map((foundWSD: WorksheetDetail) => foundWSD.targetInventory)

  /**
   * 2. Update description of putaway worksheet details
   */
  await Promise.all(
    putawayWorksheetDetails.map(async (putawayWorksheetDetail: WorksheetDetail) => {
      await wsdRepo.update(
        {
          domain,
          bizplace: customerBizplace,
          name: putawayWorksheetDetail.name,
          status: WORKSHEET_STATUS.DEACTIVATED
        },
        {
          description: putawayWorksheetDetail.description,
          status: WORKSHEET_STATUS.EXECUTING,
          updater: user
        }
      )
    })
  )
  /**
   * 3. Update target inventories (status: READY_TO_PUTAWAY => PUTTING_AWAY)
   */
  targetInventories = targetInventories.map((targetInventory: OrderInventory) => {
    return {
      ...targetInventory,
      status: ORDER_PRODUCT_STATUS.PUTTING_AWAY,
      updater: user
    }
  })
  await oiRepo.save(targetInventories)

  /**
   * 4. Update putaway Worksheet (status: DEACTIVATED => EXECUTING)
   */
  const worksheet: Worksheet = await wsRepo.save({
    ...foundWorksheet,
    status: WORKSHEET_STATUS.EXECUTING,
    startedAt: new Date(),
    updater: user
  })

  /**
   * @description
   * if current status is READY_TO_PUTAWAY
   * 5. Update Arrival Notice (status: READY_TO_PUTAWAY => PUTTING_AWAY)
   * because of partial unloading, there's a case that unloading is not completely finished yet.
   * so it's needed to update when status of arrival notice equals READY_TO_PUTAWAY which means unloading is completely finished.
   */
  const arrivalNotice: ArrivalNotice = foundWorksheet.arrivalNotice
  if (arrivalNotice.status === ORDER_STATUS.READY_TO_PUTAWAY) {
    await ganRepo.save({
      ...arrivalNotice,
      status: ORDER_STATUS.PUTTING_AWAY,
      updater: user
    })
  }
  return worksheet
}
