import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import { OrderVas } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { EntityManager } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../../entities'
import { OperationGuideInterface, PalletChangesInterface } from './interfaces'

/**
 * @description Find worksheet detail by name
 * this function will include every relations with worksheet detail for processing VAS
 *
 * @param {EntityManager} trxMgr
 * @param {Domain} domain
 * @param {String} name
 */
export async function getWorksheetDetailByName(
  trxMgr: EntityManager,
  domain: Domain,
  name: string
): Promise<WorksheetDetail> {
  const worksheetDetail: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
    where: { domain, name },
    relations: [
      'bizplace',
      'targetVas',
      'targetVas.inventory',
      'targetVas.inventory.product',
      'targetVas.vas',
      'targetVas.arrivalNotice',
      'targetVas.releaseGood',
      'targetVas.shippingOrder',
      'targetVas.vasOrder',
      'targetVas.targetProduct',
      'worksheet'
    ]
  })
  if (!worksheetDetail) throw new Error(`Couldn't find target worksheet detail`)
  if (!worksheetDetail.targetVas) throw new Error(`Couldn't find target vas`)
  return worksheetDetail
}

/**
 * @description Update every related order vas to share same operationGuide data
 *
 * @param {EntityManager} trxMgr
 * @param {Domain} domain
 * @param {Bizplace} bizplace
 * @param {WorksheetDetail} wsd
 * @param {OrderVas} targetVas
 * @param {OperationGuideInterface<RepalletizingGuide>} operationGuide
 * @param {User} user
 */
export async function updateRelatedOrderVas<T>(
  trxMgr: EntityManager,
  domain: Domain,
  bizplace: Bizplace,
  wsd: WorksheetDetail,
  targetVas: OrderVas,
  operationGuide: OperationGuideInterface<T>,
  user: User
): Promise<OrderVas> {
  const worksheet: Worksheet = wsd.worksheet
  const relatedWSDs: WorksheetDetail[] = await trxMgr.getRepository(WorksheetDetail).find({
    where: { domain, bizplace, worksheet },
    relations: ['targetVas', 'targetVas.vas']
  })

  const relatedOVs: OrderVas[] = relatedWSDs
    .map((wsd: WorksheetDetail) => wsd.targetVas)
    .filter((ov: OrderVas) => ov.set === targetVas.set && ov.vas.id === targetVas.vas.id)
    .map((ov: OrderVas) => {
      return {
        ...ov,
        operationGuide: JSON.stringify(operationGuide),
        updater: user
      }
    })

  await trxMgr.getRepository(OrderVas).save(relatedOVs)
}

/**
 * @description Return current amount of pallet
 * @param {PalletChangesInterface[]} palletChanges
 * @param {String} palletId
 */
export function getCurrentAmount(
  palletChanges: PalletChangesInterface[],
  palletId: string
): { reducedQty: number; reducedWeight: number } {
  return palletChanges
    .filter((pc: PalletChangesInterface) => pc.toPalletId === palletId)
    .reduce(
      (reducedAmount: { reducedQty: number; reducedWeight: number }, pc: PalletChangesInterface) => {
        return {
          reducedQty: reducedAmount.reducedQty + pc.reducedQty,
          reducedWeight: reducedAmount.reducedWeight + pc.reducedWeight
        }
      },
      { reducedQty: 0, reducedWeight: 0 }
    )
}

/**
 * @description Return reduced amount of pallet
 * @param {PalletChangesInterface[]} palletChanges
 * @param {String} palletId
 */
export function getReducedAmount(
  palletChanges: PalletChangesInterface[],
  palletId: string
): { reducedQty: number; reducedWeight: number } {
  return palletChanges
    .filter((pc: PalletChangesInterface) => pc.fromPalletId === palletId)
    .reduce(
      (reducedAmount: { reducedQty: number; reducedWeight: number }, pc: PalletChangesInterface) => {
        return {
          reducedQty: reducedAmount.reducedQty + pc.reducedQty,
          reducedWeight: reducedAmount.reducedWeight + pc.reducedWeight
        }
      },
      { reducedQty: 0, reducedWeight: 0 }
    )
}
