import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import { ArrivalNotice, OrderVas, ReleaseGood } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory, INVENTORY_TRANSACTION_TYPE } from '@things-factory/warehouse-base'
import { EntityManager } from 'typeorm'
import {
  createLoadingWorksheet,
  createPutawayWorksheet,
  deductProductAmount,
  getCurrentAmount,
  upsertInventory
} from '../common-utils'
import {
  OperationGuideInterface,
  PalletChangesInterface,
  RefOrderType,
  RepalletizedInvInfo,
  RepalletizingGuide
} from '../interfaces'

export async function completeRepalletizing(trxMgr: EntityManager, orderVas: OrderVas, user: User): Promise<void> {
  orderVas = await trxMgr.getRepository(OrderVas).findOne(orderVas.id, {
    relations: ['domain', 'bizplace', 'inventory', 'inventory.product', 'arrivalNotice', 'releaseGood', 'vasOrder']
  })
  const domain: Domain = orderVas.domain
  const bizplace: Bizplace = orderVas.bizplace
  let originInv: Inventory = orderVas.inventory
  const operationGuide: OperationGuideInterface<RepalletizingGuide> = JSON.parse(orderVas.operationGuide)
  const operationGuideData: RepalletizingGuide = operationGuide.data
  const { arrivalNotice, releaseGood, vasOrder } = orderVas
  const refOrder: RefOrderType = arrivalNotice || releaseGood || vasOrder

  // create repalletized inventories based on repalletizedInvs
  const repalletizedInvs: RepalletizedInvInfo[] = extractRepackedInvs(operationGuideData, originInv)
  for (const ri of repalletizedInvs) {
    const repalletizedFromList: PalletChangesInterface[] = ri.repalletizedFrom.filter(
      (rf: PalletChangesInterface) => rf.toPalletId === ri.palletId
    )
    const { qty, weight } = getCurrentAmount(repalletizedFromList, ri.palletId)
    const changedInv: Inventory = await upsertInventory(
      trxMgr,
      domain,
      bizplace,
      user,
      originInv,
      refOrder,
      ri.palletId,
      ri.locationName,
      originInv.packingType,
      qty,
      weight,
      INVENTORY_TRANSACTION_TYPE.REPALLETIZING
    )

    // Deduct amount of product on original pallet or order inventory (Case for release order)
    originInv = await deductProductAmount(
      trxMgr,
      domain,
      bizplace,
      user,
      refOrder,
      originInv,
      qty,
      weight,
      INVENTORY_TRANSACTION_TYPE.REPALLETIZING
    )

    // Create worksheet if it's related with Arrival Notice or Release Order
    if (refOrder instanceof ArrivalNotice) {
      await createPutawayWorksheet(trxMgr, domain, bizplace, user, refOrder, originInv, changedInv)
    } else if (refOrder instanceof ReleaseGood) {
      await createLoadingWorksheet(trxMgr, domain, bizplace, user, refOrder, originInv, changedInv)
    }
  }
}

function extractRepackedInvs(operationGuideData: RepalletizingGuide, originInv: Inventory): RepalletizedInvInfo[] {
  return operationGuideData.repalletizedInvs
    .filter((ri: RepalletizedInvInfo) => {
      const isPalletIncluded: boolean = Boolean(
        ri.repalletizedFrom.find((rf: PalletChangesInterface) => rf.fromPalletId === originInv.palletId)
      )
      if (isPalletIncluded) return ri
    })
    .map((ri: RepalletizedInvInfo) => {
      ri.repalletizedFrom = ri.repalletizedFrom.filter(
        (rf: PalletChangesInterface) => rf.fromPalletId === originInv.palletId
      )
      return ri
    })
}
