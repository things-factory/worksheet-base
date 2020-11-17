import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import { Product } from '@things-factory/product-base'
import { ArrivalNotice, OrderVas, ReleaseGood } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory, INVENTORY_TRANSACTION_TYPE } from '@things-factory/warehouse-base'
import { EntityManager } from 'typeorm'
import {
  createLoadingWorksheet,
  createPutawayWorksheet,
  deductProductAmount,
  getReducedAmount,
  upsertInventory
} from '../common-utils'
import {
  OperationGuideInterface,
  PalletChangesInterface,
  RefOrderType,
  RelabelingGuide,
  RelabelingToProduct
} from '../interfaces'

export async function completeRelabeling(trxMgr: EntityManager, orderVas: OrderVas, user: User): Promise<void> {
  orderVas = await trxMgr.getRepository(OrderVas).findOne(orderVas.id, {
    relations: ['domain', 'bizplace', 'inventory', 'inventory.product', 'arrivalNotice', 'releaseGood', 'vasOrder']
  })

  const domain: Domain = orderVas.domain
  const bizplace: Bizplace = orderVas.bizplace
  let originInv: Inventory = orderVas.inventory
  const operationGuide: OperationGuideInterface<RelabelingGuide> = JSON.parse(orderVas.operationGuide)
  const operationGuideData: RelabelingGuide = operationGuide.data
  const { toBatchId, toProduct }: { toBatchId?: string; toProduct?: RelabelingToProduct } = operationGuideData
  const { arrivalNotice, releaseGood, vasOrder } = orderVas
  const refOrder: RefOrderType = arrivalNotice || releaseGood || vasOrder
  const palletChanges: PalletChangesInterface[] = extractRelabeledPallets(
    operationGuideData.relabeledFrom,
    orderVas.inventory.palletId
  )

  let copiedInv: Inventory = Object.assign({}, originInv)
  if (toBatchId) copiedInv.batchId = toBatchId
  if (toProduct) copiedInv.product = await trxMgr.getRepository(Product).findOne(toProduct.id)

  copiedInv.refInventory = originInv

  for (const palletChange of palletChanges) {
    const newInventory: Inventory = await upsertInventory(
      trxMgr,
      domain,
      bizplace,
      user,
      copiedInv,
      refOrder,
      palletChange.toPalletId,
      palletChange.locationName,
      copiedInv.packingType,
      palletChange.reducedQty,
      palletChange.reducedStdUnitValue,
      INVENTORY_TRANSACTION_TYPE.RELABELING
    )

    const { reducedQty, reducedStdUnitValue } = getReducedAmount(palletChanges, orderVas.inventory.palletId)
    // Deduct amount of product on original pallet or order inventory (Case for release order)
    // originInv = await deductProductAmount(trxMgr, domain, bizplace, user, refOrder, originInv, qty, stdUnitValue)
    originInv = await deductProductAmount(
      trxMgr,
      domain,
      bizplace,
      user,
      refOrder,
      originInv,
      reducedQty,
      reducedStdUnitValue,
      INVENTORY_TRANSACTION_TYPE.RELABELING
    )

    // Create worksheet if it's related with Arrival Notice or Release Order
    if (refOrder instanceof ArrivalNotice) {
      await createPutawayWorksheet(trxMgr, domain, bizplace, user, refOrder, originInv, newInventory)
    } else if (refOrder instanceof ReleaseGood) {
      await createLoadingWorksheet(trxMgr, domain, bizplace, user, refOrder, originInv, newInventory)
    }
  }
}

function extractRelabeledPallets(palletChanges: PalletChangesInterface[], palletId: string): PalletChangesInterface[] {
  return palletChanges.filter((pc: PalletChangesInterface) => pc.fromPalletId === palletId)
}
