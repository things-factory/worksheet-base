import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import {
  ArrivalNotice,
  OrderVas,
  ORDER_STATUS,
  ORDER_TYPES,
  ORDER_VAS_STATUS,
  ReleaseGood,
  VasOrder
} from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager, FindOneOptions, getManager } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../../constants'
import { Worksheet, WorksheetDetail } from '../../../entities'
import { activateLoading } from './activate-worksheet/activate-loading'
import { activatePutaway } from './activate-worksheet/activate-putaway'
import { completeRelabeling, completeRepackaging, completeRepalletizing, RefOrderType } from './vas-transactions'

type CompleteTransactionType = (trxMgr: EntityManager, orderVas: OrderVas, user: User) => Promise<void>

const ENTITY_MAP: { [key: string]: RefOrderType } = {
  [ORDER_TYPES.ARRIVAL_NOTICE]: ArrivalNotice,
  [ORDER_TYPES.RELEASE_OF_GOODS]: ReleaseGood,
  [ORDER_TYPES.VAS_ORDER]: VasOrder
}

const COMPLETE_TRX_MAP: { [key: string]: CompleteTransactionType } = {
  'vas-repalletizing': completeRepalletizing,
  'vas-repack': completeRepackaging,
  'vas-relabel': completeRelabeling
}

export const completeVas = {
  async completeVas(_: any, { orderNo, orderType }, context: any) {
    return await getManager().transaction(async (trxMgr: EntityManager) => {
      const domain: Domain = context.state.domain
      const user: User = context.state.user

      // Find out reference order to find specific vas worksheet
      const refOrder: RefOrderType = await getReferenceOrder(trxMgr, domain, orderNo, orderType)
      // Find out VAS worksheet by referenced order to update
      const vasWS: Worksheet = await getVasWorksheet(trxMgr, domain, refOrder)
      // Update status of worksheet from EXECUTING to DONE
      vasWS.status = WORKSHEET_STATUS.DONE
      vasWS.endedAt = new Date()
      vasWS.updater = user
      await trxMgr.getRepository(Worksheet).save(vasWS)

      // Update status of worksheet detail from EXECUTING to DONE
      const vasWSDs: WorksheetDetail[] = vasWS.worksheetDetails.map((wsd: WorksheetDetail) => {
        wsd.status = WORKSHEET_STATUS.DONE
        wsd.updater = user
        return wsd
      })
      await trxMgr.getRepository(WorksheetDetail).save(vasWSDs)

      // Update status of order vas from PROCESSING to TERMINATED
      const orderVASs: OrderVas[] = vasWSDs
        .map((wsd: WorksheetDetail) => wsd.targetVas)
        .map((ov: OrderVas) => {
          ov.status = ORDER_VAS_STATUS.TERMINATED
          ov.updater = user
          return ov
        })
      await trxMgr.getRepository(OrderVas).save(orderVASs)

      // Do complete operation transactions if there it is
      for (const ov of orderVASs) {
        const { issue }: { issue: string } = vasWSDs.find((wsd: WorksheetDetail) => wsd.targetVas.id === ov.id)
        if (ov?.operationGuide && !issue) {
          await doOperationTransaction(trxMgr, ov, user)
        }
      }

      // Updats status of VAS Order to DONE when it's pure VAS Order
      if (refOrder instanceof VasOrder) {
        refOrder.status = ORDER_STATUS.DONE
        refOrder.updater = user
        await trxMgr.getRepository(VasOrder).save(refOrder)
      } else {
        // Activate next worksheet if it's related with Arrival Notice or Release Goods and doesn't have issue
        const isIssueExists: boolean = vasWSDs.some((wsd: WorksheetDetail) => wsd.issue)
        if (refOrder instanceof ArrivalNotice && !isIssueExists) {
          // Activate putaway worksheet
          await activatePutawayWorksheet(trxMgr, domain, user, refOrder)
        } else if (refOrder instanceof ReleaseGood && !isIssueExists) {
          // Activate loading worksheet
          await activateLoadingWorksheet(trxMgr, domain, user, refOrder)
        }
      }
    })
  }
}

/**
 * @description Find out specific order by its name and type
 *
 * @param {EntityManager} trxMgr
 * @param {Domain} domain
 * @param {String} orderNo
 * @param {String} orderType
 *
 * @returns {ArrivalNotice | ReleaseOrder | VasOrder} Found specific order
 */
async function getReferenceOrder(
  trxMgr: EntityManager,
  domain: Domain,
  orderNo: string,
  orderType: string
): Promise<RefOrderType> {
  const refOrder: RefOrderType = await trxMgr
    .getRepository(ENTITY_MAP[orderType])
    .findOne({ where: { domain, name: orderNo }, relations: ['bizplace'] })

  if (!refOrder) throw new Error(`Couldn't find reference order by order number (${orderNo})`)
  return refOrder
}

/**
 * @description Find specific VAS workshet by its referenced order
 * One VAS worksheet only can have one specific related order
 *
 * @param {EntityManager} trxMgr
 * @param {Domain} domain
 * @param {ArrivalNotice | ReleaseGood | VasOrder} refOrder
 * @returns {Promise<Worksheet>}
 */
async function getVasWorksheet(trxMgr: EntityManager, domain: Domain, refOrder: RefOrderType): Promise<Worksheet> {
  let worksheet: Worksheet
  let findOneOptions: FindOneOptions<Worksheet> = {
    where: { domain, type: WORKSHEET_TYPE.VAS, status: WORKSHEET_STATUS.EXECUTING },
    relations: ['worksheetDetails', 'worksheetDetails.targetVas', 'worksheetDetails.targetVas.vas']
  }
  if (refOrder instanceof ArrivalNotice) {
    findOneOptions.where['arrivalNotice'] = refOrder
  } else if (refOrder instanceof ReleaseGood) {
    findOneOptions.where['releaseGood'] = refOrder
  } else if (refOrder instanceof VasOrder) {
    findOneOptions.where['vasOrder'] = refOrder
  }

  worksheet = await trxMgr.getRepository(Worksheet).findOne(findOneOptions)
  if (!worksheet) throw new Error(`Couldn't find worksheet by reference order (${refOrder.name})`)
  return worksheet
}

/**
 * @description Execute transactions which are related with special VAS
 * The transaction functions will be found from COMPLETE_TRX_MAP
 *
 * @param {EntityManager} trxMgr
 * @param {OrderVas} orderVas
 * @param {User} user
 */
async function doOperationTransaction(trxMgr: EntityManager, orderVas: OrderVas, user: User) {
  const operationGuide: string = orderVas?.vas?.operationGuide
  if (operationGuide) {
    await COMPLETE_TRX_MAP[operationGuide](trxMgr, orderVas, user)
  }
}

/**
 * @description Activating putaway worksheet
 *
 * @param {EntityManager} trxMgr
 * @param {Domain} domain
 * @param {User} user
 * @param {ArrivalNotice | ReleaseGood | VasOrder }refOrder
 */
async function activatePutawayWorksheet(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  refOrder: ArrivalNotice
): Promise<void> {
  const bizplace: Bizplace = refOrder.bizplace
  const putawayWS: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
    where: { domain, bizplace, type: WORKSHEET_TYPE.PUTAWAY, arrivalNotice: refOrder },
    relations: ['worksheetDetails']
  })
  if (!putawayWS) throw new Error(`Couldn't find putaway worksheet related with (${refOrder.name})`)
  await activatePutaway(trxMgr, domain, user, putawayWS.name, putawayWS.worksheetDetails)
}

/**
 * @description Activating loading worksheet
 *
 * @param {EntityManager} trxMgr
 * @param {Domain} domain
 * @param {User} user
 * @param {ArrivalNotice | ReleaseGood | VasOrder }refOrder
 */
async function activateLoadingWorksheet(
  trxMgr: EntityManager,
  domain: Domain,
  user: User,
  refOrder: ReleaseGood
): Promise<void> {
  const bizplace: Bizplace = refOrder.bizplace
  const loadingWS: Worksheet = await trxMgr.getRepository(Worksheet).findOne({
    where: { domain, bizplace, type: WORKSHEET_TYPE.LOADING, releaseGood: refOrder },
    relations: ['worksheetDetails']
  })
  if (!loadingWS) throw new Error(`Couldn't find loading worksheet related with (${refOrder.name})`)
  await activateLoading(loadingWS.name, loadingWS.worksheetDetails, domain, user, trxMgr)
}
