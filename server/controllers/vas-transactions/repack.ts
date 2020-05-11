import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import { ArrivalNotice, OrderVas, ReleaseGood, ShippingOrder, VasOrder } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import {
  Inventory,
  InventoryNoGenerator,
  INVENTORY_STATUS,
  INVENTORY_TRANSACTION_TYPE,
  Location
} from '@things-factory/warehouse-base'
import { EntityManager, Repository } from 'typeorm'
import { Worksheet, WorksheetDetail } from '../../entities'
import { generateInventoryHistory } from '../../utils'

interface IOperationGuideData {
  packingUnit: string
  toPackingType: string
  stdAmount: number
  packageQty: number
}

export async function repack(trxMgr: EntityManager, orderVas: OrderVas, params: any, context: any) {
  const ovRepo: Repository<OrderVas> = trxMgr.getRepository(OrderVas)
  const invRepo: Repository<Inventory> = trxMgr.getRepository(Inventory)
  const locRepo: Repository<Location> = trxMgr.getRepository(Location)
  const wsRepo: Repository<Worksheet> = trxMgr.getRepository(Worksheet)

  orderVas = await ovRepo.findOne(orderVas.id, {
    relations: [
      'inventory',
      'inventory.bizplace',
      'inventory.product',
      'inventory.warehouse',
      'arrivalNotice',
      'releaseGood',
      'shippingOrder',
      'vasOrder',
      'vas'
    ]
  })

  let inventory: Inventory = orderVas.inventory
  const refOrder: any = orderVas.arrivalNotice || orderVas.releaseGood || orderVas.shippingOrder || orderVas.vasOrder
  const operationGuideData: IOperationGuideData = JSON.parse(orderVas.operationGuide).data

  const packingUnit: string = operationGuideData.packingUnit
  const toPackingType: string = operationGuideData.toPackingType
  const stdAmount: number = operationGuideData.stdAmount
  const domain: Domain = context.state.domain
  const bizplace: Bizplace = inventory.bizplace
  const user: User = context.state.user

  const repackedPallets = JSON.parse(params)

  const totalPackedAmount = repackedPallets.reduce((totalPackedAmount: number, repackedPallet: any): number => {
    totalPackedAmount += repackedPallet.packageQty * stdAmount
    return totalPackedAmount
  }, 0)

  let isWholeRepack: boolean
  if (packingUnit === 'WEIGHT') {
    isWholeRepack = inventory.weight === totalPackedAmount
  } else if (packingUnit === 'QTY') {
    isWholeRepack = inventory.qty === totalPackedAmount
  }

  // Repack whole inventory
  if (isWholeRepack) {
    // Terminate original pallet.

    await invRepo.save({
      ...inventory,
      qty: 0,
      weight: 0,
      status: INVENTORY_STATUS.TERMINATED,
      updater: user
    })

    await generateInventoryHistory(
      inventory,
      refOrder,
      INVENTORY_TRANSACTION_TYPE.REPACKAGING,
      -inventory.qty,
      -inventory.weight,
      user,
      trxMgr
    )

    for (const repackedPallet of repackedPallets) {
      let weight: number

      if (packingUnit === 'WEIGHT') {
        weight = stdAmount * repackedPallet.packageQty
      } else if (packingUnit === 'QTY') {
        weight = (inventory.weight / inventory.qty) * stdAmount * repackedPallet.packageQty
      }

      const location: Location = await locRepo.findOne({
        where: { domain, name: repackedPallet.locationName }
      })

      const newInventory: Inventory = await invRepo.save({
        domain,
        bizplace,
        palletId: repackedPallet.palletId,
        batchId: inventory.batchId,
        name: InventoryNoGenerator.inventoryName(),
        product: inventory.product,
        packingType: toPackingType,
        qty: repackedPallet.packageQty,
        weight,
        refOrderId: refOrder.id,
        refInventory: inventory,
        warehouse: inventory.warehouse,
        location,
        zone: location.zone,
        orderProductId: inventory.orderProductId,
        status: inventory.status,
        creator: user,
        updater: user
      })

      await generateInventoryHistory(
        newInventory,
        refOrder,
        INVENTORY_TRANSACTION_TYPE.REPACKAGING,
        newInventory.qty,
        newInventory.weight,
        user,
        trxMgr
      )
    }
  } else {
    // Update original inventory
    let remainWeight: number
    let remainQty: number

    if (packingUnit === 'WEIGHT') {
      remainWeight = inventory.weight - totalPackedAmount
      remainQty = remainWeight / (inventory.weight / inventory.qty)
    } else if (packingUnit === 'QTY') {
      remainQty = inventory.qty - totalPackedAmount
      remainWeight = (inventory.weight / inventory.qty) * remainQty
    }

    await invRepo.save({
      ...inventory,
      qty: remainQty,
      weight: remainWeight,
      updater: user
    })

    await generateInventoryHistory(
      inventory,
      refOrder,
      INVENTORY_TRANSACTION_TYPE.REPACKAGING,
      -(inventory.qty - remainQty),
      -(inventory.weight - remainWeight),
      user,
      trxMgr
    )

    for (const repackedPallet of repackedPallets) {
      let weight: number

      if (packingUnit === 'WEIGHT') {
        weight = stdAmount * repackedPallet.packageQty
      } else if (packingUnit === 'QTY') {
        weight = (inventory.weight / inventory.qty) * stdAmount * repackedPallet.packageQty
      }

      const location: Location = await locRepo.findOne(repackedPallet.locationName)

      const newInventory: Inventory = await invRepo.save({
        domain,
        bizplace,
        palletId: repackedPallet.palletId,
        batchId: inventory.batchId,
        name: InventoryNoGenerator.inventoryName(),
        product: inventory.product,
        packingType: toPackingType,
        qty: repackedPallet.packageQty,
        weight,
        refOrderId: refOrder.id,
        refInventory: inventory,
        warehouse: inventory.warehouse,
        location,
        zone: location.zone,
        orderProductId: inventory.orderProductId,
        status: inventory.status,
        creator: user,
        updater: user
      })

      await generateInventoryHistory(
        newInventory,
        refOrder,
        INVENTORY_TRANSACTION_TYPE.REPACKAGING,
        newInventory.qty,
        newInventory.weight,
        user,
        trxMgr
      )
    }
  }

  let wsFindCondition: {
    arrivalNotice?: ArrivalNotice
    releaseGood?: ReleaseGood
    vasOrder?: VasOrder
    shippingOrder?: ShippingOrder
  }

  if (inventory.arrivalNotice) wsFindCondition.arrivalNotice = inventory.arrivalNotice
  if (inventory.releaseGood) wsFindCondition.releaseGood = inventory.releaseGood
  if (inventory.vasOrder) wsFindCondition.vasOrder = inventory.vasOrder
  if (inventory.shippingOrder) wsFindCondition.shippingOrder = inventory.shippingOrder

  const worksheet: Worksheet = await wsRepo.findOne({
    where: wsFindCondition,
    relations: ['worksheetDetails', 'worksheetDetails.targetVas', 'worksheetDetails.targetVas.vas']
  })

  const worksheetDetails: WorksheetDetail[] = worksheet.worksheetDetails
  let relatedOrderVas: OrderVas[] = worksheetDetails
    .map((wsd: WorksheetDetail) => wsd.targetVas)
    .filter((targetVas: OrderVas) => targetVas.set === orderVas.set && targetVas.vas.id === orderVas.vas.id)

  const updatedOperationGuideData: IOperationGuideData = {
    ...operationGuideData,
    packageQty:
      operationGuideData.packageQty -
      repackedPallets.reduce((totalPackageQty, repackedPallet): number => {
        totalPackageQty += repackedPallet.packageQty
        return totalPackageQty
      }, 0)
  }

  relatedOrderVas = relatedOrderVas.map((orderVas: OrderVas) => {
    let operationGuide: { data: IOperationGuideData; [key: string]: any } = JSON.parse(orderVas.operationGuide)

    return {
      ...orderVas,
      operationGuide: JSON.stringify({
        ...operationGuide,
        data: updatedOperationGuideData
      })
    }
  })

  await ovRepo.save(relatedOrderVas)
}
