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
  PackingUnits,
  PalletChangesInterface,
  RefOrderType,
  RepackagingGuide,
  RepackedInvInfo
} from '../interfaces'

export async function completeRepackaging(trxMgr: EntityManager, orderVas: OrderVas, user: User): Promise<void> {
  orderVas = await trxMgr.getRepository(OrderVas).findOne(orderVas.id, {
    relations: ['domain', 'bizplace', 'inventory', 'inventory.product', 'arrivalNotice', 'releaseGood', 'vasOrder']
  })
  const domain: Domain = orderVas.domain
  const bizplace: Bizplace = orderVas.bizplace
  let originInv: Inventory = orderVas.inventory
  const operationGuide: OperationGuideInterface<RepackagingGuide> = JSON.parse(orderVas.operationGuide)
  const operationGuideData: RepackagingGuide = operationGuide.data
  const packingUnit: string = operationGuideData.packingUnit
  const stdAmount: number = operationGuideData.stdAmount
  const toPackingType: string = operationGuideData.toPackingType
  const { arrivalNotice, releaseGood, vasOrder } = orderVas
  const refOrder: RefOrderType = arrivalNotice || releaseGood || vasOrder

  const repackedInvs: RepackedInvInfo[] = extractRepackedInvs(operationGuideData, originInv)
  // create repacked inventories based on repackedInvs
  for (const ri of repackedInvs) {
    const repackedFromList: PalletChangesInterface[] = ri.repackedFrom.filter(
      (rf: PalletChangesInterface) => rf.toPalletId === ri.palletId
    )
    const { qty, weight } = getCurrentAmount(repackedFromList, ri.palletId)
    const repackedPkgQty: number = packingUnit === PackingUnits.QTY ? qty / stdAmount : weight / stdAmount

    const changedInv: Inventory = await upsertInventory(
      trxMgr,
      domain,
      bizplace,
      user,
      originInv,
      refOrder,
      ri.palletId,
      ri.locationName,
      toPackingType,
      repackedPkgQty,
      weight,
      INVENTORY_TRANSACTION_TYPE.REPACKAGING
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
      INVENTORY_TRANSACTION_TYPE.REPACKAGING
    )

    // Create worksheet if it's related with Arrival Notice or Release Order
    if (refOrder instanceof ArrivalNotice) {
      // await createPutawayWorksheet(trxMgr, domain, bizplace, refOrder, originInv, changedInv, user)
      await createPutawayWorksheet(trxMgr, domain, bizplace, user, refOrder, originInv, changedInv)
    } else if (refOrder instanceof ReleaseGood) {
      // await createLoadingWorksheet(trxMgr, domain, bizplace, refOrder, originInv, changedInv, user)
      await createLoadingWorksheet(trxMgr, domain, bizplace, user, refOrder, originInv, changedInv)
    }
  }
}

function extractRepackedInvs(operationGuideData: RepackagingGuide, originInv: Inventory): RepackedInvInfo[] {
  return operationGuideData.repackedInvs
    .filter((ri: RepackedInvInfo) => {
      const isPalletIncluded: boolean = Boolean(
        ri.repackedFrom.find((rf: PalletChangesInterface) => rf.fromPalletId === originInv.palletId)
      )
      if (isPalletIncluded) return ri
    })
    .map((ri: RepackedInvInfo) => {
      ri.repackedFrom = ri.repackedFrom.filter((rf: PalletChangesInterface) => rf.fromPalletId === originInv.palletId)
      return ri
    })
}
