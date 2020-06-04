import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import { OrderInventory, OrderVas, ORDER_TYPES, ReleaseGood } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory, Location, Warehouse } from '@things-factory/warehouse-base'
import { EntityManager, getManager } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../../../../entities'
import {
  OperationGuideInterface,
  PackingUnits,
  RefOrderType,
  RepackagingGuide,
  RepackedFrom,
  RepackedInvInfo
} from '../intefaces'

export const repackagingResolver = {
  async repackaging(_: any, { worksheetDetailName, fromPalletIds, palletId, locationName }, context: any) {
    return await getManager().transaction(async (trxMgr: EntityManager) => {
      /**
       * Initialize required variables
       */
      const domain: Domain = context.state.domain
      const user: User = context.state.user

      // Find target worksheet detail & target order vas
      const wsd: WorksheetDetail = await trxMgr.getRepository(WorksheetDetail).findOne({
        where: { domain, name: worksheetDetailName },
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
          'worksheet'
        ]
      })

      const bizplace: Bizplace = wsd.bizplace
      const targetVas: OrderVas = wsd.targetVas
      let originInv: Inventory = targetVas.inventory
      const location: Location = await trxMgr.getRepository(Location).findOne({
        where: { domain, name: locationName },
        relations: ['warehouse']
      })
      const warehouse: Warehouse = location.warehouse
      // Update operation guide data for every related repalletizing vas
      const operationGuide: OperationGuideInterface<RepackagingGuide> = JSON.parse(targetVas.operationGuide)
      let operationGuideData: RepackagingGuide = operationGuide.data
      if (!operationGuideData.repackedInvs) operationGuideData.repackedInvs = []

      let refOrder: RefOrderType
      if (targetVas?.arrivalNotice?.id) {
        refOrder = targetVas.arrivalNotice
      } else if (targetVas?.releaseGood?.id) {
        refOrder = targetVas.releaseGood
      } else if (targetVas?.shippingOrder?.id) {
        refOrder = targetVas.shippingOrder
      } else if (targetVas?.vasOrder?.id) {
        refOrder = targetVas.vasOrder
      }

      // Validity checking
      if (!wsd) throw new Error(`Couldn't find target worksheet detail`)
      if (!targetVas) throw new Error(`Couldn't find target vas`)
      if (!originInv) throw new Error(`Inventory wasn't assigned to target vas`)
      if (!refOrder) throw new Error(`Couldn't find reference order with current order vas`)
      if (!location) throw new Error(`Couldn't find location by its name (${locationName})`)
      if (!warehouse) throw new Error(`Location (name: ${locationName}) doesn't have any relation with warehouse`)

      let repackedQty: number = 0
      let repackedWeight: number = 0

      let repackedInv: RepackedInvInfo = {
        palletId,
        locationName,
        repackedPkgQty: 1,
        repackedFrom: []
      }

      for (const fromPalletId of fromPalletIds) {
        const { reducedQty, reducedWeight } = getReducedAmount(fromPalletId, operationGuideData.repackedInvs)
        const { remainQty, remainWeight } = await getRemainInventoryAmount(
          trxMgr,
          refOrder,
          domain,
          bizplace,
          originInv,
          reducedQty,
          reducedWeight
        )
        const unitWeight: number = await getUnitWeight(trxMgr, refOrder, domain, bizplace, originInv)
        let repackedFrom: RepackedFrom = {
          fromPalletId,
          toPalletId: palletId,
          reducedQty: 0,
          reducedWeight: 0
        }

        if (operationGuideData.packingUnit === PackingUnits.QTY) {
          // 기준 수량 보다 남은 수량이 적을 경우 남은 수량 전체를 Repack하고 다음 pallet에서 잔여 수량을 차감함
          if (remainQty < operationGuideData.stdAmount - repackedQty) {
            repackedFrom.reducedQty = remainQty
            repackedFrom.reducedWeight = remainQty * unitWeight

            repackedQty += remainQty
            repackedWeight += remainQty * unitWeight
          } else {
            // 기준 수량 보다 남은 수량이 많거나 같을 경우 기준 수량과 동일한 양의 수량으로 Repack을 수행함
            repackedFrom.reducedQty = operationGuideData.stdAmount - repackedQty
            repackedFrom.reducedWeight = (operationGuideData.stdAmount - repackedQty) * unitWeight

            repackedQty += operationGuideData.stdAmount - repackedQty
            repackedWeight += (operationGuideData.stdAmount - repackedQty) * unitWeight
          }
        } else if (operationGuideData.packingUnit === PackingUnits.WEIGHT) {
          // 기준 중량 보다 남은 중량이 적을 경우 남은 중량 전체를 Repack하고 다음 pallet에서 잔여 수량을 차감함
          if (remainWeight < operationGuideData.stdAmount - repackedWeight) {
            repackedFrom.reducedWeight = remainWeight
            repackedFrom.reducedQty = remainWeight / unitWeight

            repackedWeight += remainWeight
            repackedQty += remainWeight / unitWeight
          } else {
            // 기준 중량 보다 남은 중량이 많거나 같을 경우 기준 중량과 동일한 양의 수량으로 Repack을 수행함
            repackedFrom.reducedWeight = operationGuideData.stdAmount - repackedWeight
            repackedFrom.reducedQty = (operationGuideData.stdAmount - repackedWeight) / unitWeight

            repackedWeight += operationGuideData.stdAmount - repackedWeight
            repackedQty += (operationGuideData.stdAmount - repackedWeight) / unitWeight
          }
        }

        repackedInv.repackedFrom.push(repackedFrom)
      }

      // Update operation guide data for whole related order vas
      const worksheet: Worksheet = wsd.worksheet
      const relatedWSDs: WorksheetDetail[] = await trxMgr.getRepository(WorksheetDetail).find({
        where: { domain, bizplace, worksheet },
        relations: ['targetVas', 'targetVas.vas']
      })

      const relatedOVs: OrderVas[] = relatedWSDs
        .map((wsd: WorksheetDetail) => wsd.targetVas)
        .filter((ov: OrderVas) => ov.set === targetVas.set && ov.vas.id === targetVas.vas.id)
        .map((ov: OrderVas) => {
          const updatedOperationGuideData: RepackagingGuide = {
            packingUnit: operationGuideData.packingUnit,
            toPackingType: operationGuideData.toPackingType,
            stdAmount: operationGuideData.stdAmount,
            requiredPackageQty: operationGuideData.requiredPackageQty - 1,
            repackedInvs: [...operationGuideData.repackedInvs, repackedInv]
          }

          return {
            ...ov,
            operationGuide: JSON.stringify({
              ...operationGuide,
              data: updatedOperationGuideData,
              completed: !Boolean(updatedOperationGuideData.requiredPackageQty)
            })
          }
        })

      await trxMgr.getRepository(OrderVas).save(relatedOVs)
    })
  }
}

/**
 * @description Loop through whole repacked to return reduced sum of qty and weight
 * from information which is describing any changes about qty and weight of inventory ord order inventories (for R.O case)
 * @param palletId
 * @param repackedInvs
 */
function getReducedAmount(
  palletId: string,
  repackedInvs: RepackedInvInfo[]
): { reducedQty: number; reducedWeight: number } {
  const repackedFromList: RepackedFrom[] = repackedInvs
    .map((repackedInv: RepackedInvInfo) => repackedInv.repackedFrom)
    .flat()
  return repackedFromList
    .filter((repackedFrom: RepackedFrom) => repackedFrom.fromPalletId === palletId)
    .reduce(
      (reducedAmount: { reducedQty: number; reducedWeight: number }, repackedFrom: RepackedFrom) => {
        return {
          reducedQty: reducedAmount.reducedQty + repackedFrom.reducedQty,
          reducedWeight: reducedAmount.reducedWeight + repackedFrom.reducedWeight
        }
      },
      { reducedQty: 0, reducedWeight: 0 }
    )
}

async function getRemainInventoryAmount(
  trxMgr: EntityManager,
  refOrder: RefOrderType,
  domain: Domain,
  bizplace: Bizplace,
  originInv: Inventory,
  reducedQty: number,
  reducedWeight: number
): Promise<{ remainQty: number; remainWeight: number }> {
  let remainQty: number = 0
  let remainWeight: number = 0

  if (refOrder instanceof ReleaseGood) {
    // Find loading order inventory to figure out unit weight
    const orderInv: OrderInventory = await trxMgr.getRepository(OrderInventory).findOne({
      where: { domain, bizplace, inventory: originInv, releaseGood: refOrder, type: ORDER_TYPES.RELEASE_OF_GOODS }
    })

    remainQty = orderInv.releaseQty - reducedQty
    remainWeight = orderInv.releaseWeight - reducedWeight
  } else {
    remainQty = originInv.qty - reducedQty
    remainWeight = originInv.weight - reducedWeight
  }
  return { remainQty, remainWeight }
}

async function getUnitWeight(
  trxMgr: EntityManager,
  refOrder: RefOrderType,
  domain: Domain,
  bizplace: Bizplace,
  originInv: Inventory
): Promise<number> {
  let unitWeight: number

  if (refOrder instanceof ReleaseGood) {
    // Find loading order inventory to figure out unit weight
    const orderInv: OrderInventory = await trxMgr.getRepository(OrderInventory).findOne({
      where: { domain, bizplace, inventory: originInv, releaseGood: refOrder, type: ORDER_TYPES.RELEASE_OF_GOODS }
    })
    unitWeight = orderInv.releaseWeight / orderInv.releaseQty
  } else {
    unitWeight = originInv.weight / originInv.qty
  }
  return unitWeight
}
