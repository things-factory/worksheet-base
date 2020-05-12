import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import {
  ArrivalNotice,
  OrderVas,
  ORDER_VAS_STATUS,
  ReleaseGood,
  ShippingOrder,
  VasOrder
} from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import {
  Inventory,
  InventoryNoGenerator,
  INVENTORY_STATUS,
  INVENTORY_TRANSACTION_TYPE,
  Location
} from '@things-factory/warehouse-base'
import { EntityManager, Repository } from 'typeorm'
import { WORKSHEET_STATUS } from '../../constants'
import { Worksheet, WorksheetDetail } from '../../entities'
import { generateInventoryHistory } from '../../utils'

interface IOperationGuideData {
  packingUnit: string
  toPackingType: string
  stdAmount: number
  packageQty: number
}

interface IRepackedPallet {
  palletId: string
  locationName: string
  packageQty: number
}

export async function repack(
  trxMgr: EntityManager,
  orderVas: OrderVas,
  repackedPallets: IRepackedPallet[],
  context: any
) {
  const ovRepo: Repository<OrderVas> = trxMgr.getRepository(OrderVas)
  const invRepo: Repository<Inventory> = trxMgr.getRepository(Inventory)
  const wsRepo: Repository<Worksheet> = trxMgr.getRepository(Worksheet)
  const wsdRepo: Repository<WorksheetDetail> = trxMgr.getRepository(WorksheetDetail)

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

  const totalPackedAmount = repackedPallets.reduce(
    (totalPackedAmount: number, repackedPallet: IRepackedPallet): number => {
      totalPackedAmount += repackedPallet.packageQty * stdAmount
      return totalPackedAmount
    },
    0
  )

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
      let weight: number = calcWeight(packingUnit, stdAmount, repackedPallet, inventory)
      const newInventory: Inventory = await createNewInventory(
        trxMgr,
        domain,
        bizplace,
        inventory,
        repackedPallet,
        toPackingType,
        refOrder.id,
        weight,
        user
      )

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
    const { remainWeight, remainQty } = calcRemainAmount(packingUnit, inventory, totalPackedAmount)
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
      let weight: number = calcWeight(packingUnit, stdAmount, repackedPallet, inventory)
      const newInventory: Inventory = await createNewInventory(
        trxMgr,
        domain,
        bizplace,
        inventory,
        repackedPallet,
        toPackingType,
        refOrder.id,
        weight,
        user
      )

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
  } = {}

  if (orderVas.arrivalNotice) wsFindCondition.arrivalNotice = orderVas.arrivalNotice
  if (orderVas.releaseGood) wsFindCondition.releaseGood = orderVas.releaseGood
  if (orderVas.vasOrder) wsFindCondition.vasOrder = orderVas.vasOrder
  if (orderVas.shippingOrder) wsFindCondition.shippingOrder = orderVas.shippingOrder

  const worksheet: Worksheet = await wsRepo.findOne({
    where: wsFindCondition,
    relations: ['worksheetDetails', 'worksheetDetails.targetVas', 'worksheetDetails.targetVas.vas']
  })

  let worksheetDetails: WorksheetDetail[] = worksheet.worksheetDetails
  let relatedOrderVas: OrderVas[] = worksheetDetails
    .map((wsd: WorksheetDetail) => wsd.targetVas)
    .filter((targetVas: OrderVas) => targetVas.set === orderVas.set && targetVas.vas.id === orderVas.vas.id)

  const updatedOperationGuideData: IOperationGuideData = {
    ...operationGuideData,
    packageQty:
      operationGuideData.packageQty -
      repackedPallets.reduce((totalPackageQty: number, repackedPallet: IRepackedPallet): number => {
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

  // Complete related order vas if there's no more packageQty
  if (!updatedOperationGuideData.packageQty) {
    // Update worksheet details
    worksheetDetails = worksheetDetails.map((wsd: WorksheetDetail) => {
      return {
        ...wsd,
        status: WORKSHEET_STATUS.DONE,
        updater: user
      }
    })

    await wsdRepo.save(worksheetDetails)

    // Update vas
    relatedOrderVas = relatedOrderVas.map((ov: OrderVas) => {
      return {
        ...ov,
        status: ORDER_VAS_STATUS.COMPLETED,
        updater: user
      }
    })
  }
}

function calcWeight(
  packingUnit: string,
  stdAmount: number,
  repackedPallet: IRepackedPallet,
  inventory: Inventory
): number {
  let weight: number
  if (packingUnit === 'WEIGHT') {
    weight = stdAmount * repackedPallet.packageQty
  } else if (packingUnit === 'QTY') {
    weight = (inventory.weight / inventory.qty) * stdAmount * repackedPallet.packageQty
  }
  return weight
}

function calcRemainAmount(
  packingUnit: string,
  inventory: Inventory,
  totalPackedAmount: number
): { remainWeight: number; remainQty: number } {
  let remainWeight: number
  let remainQty: number

  if (packingUnit === 'WEIGHT') {
    remainWeight = inventory.weight - totalPackedAmount
    remainQty = remainWeight / (inventory.weight / inventory.qty)
  } else if (packingUnit === 'QTY') {
    remainQty = inventory.qty - totalPackedAmount
    remainWeight = (inventory.weight / inventory.qty) * remainQty
  }

  return { remainWeight, remainQty }
}

async function createNewInventory(
  trxMgr: EntityManager,
  domain: Domain,
  bizplace: Bizplace,
  inventory: Inventory,
  repackedPallet: IRepackedPallet,
  packingType: string,
  refOrderId: string,
  weight: number,
  user: User
): Promise<Inventory> {
  const locRepo: Repository<Location> = trxMgr.getRepository(Location)
  const invRepo: Repository<Inventory> = trxMgr.getRepository(Inventory)

  const location: Location = await locRepo.findOne({
    where: { domain, name: repackedPallet.locationName }
  })

  return await invRepo.save({
    domain,
    bizplace,
    palletId: repackedPallet.palletId,
    batchId: inventory.batchId,
    name: InventoryNoGenerator.inventoryName(),
    product: inventory.product,
    packingType,
    qty: repackedPallet.packageQty,
    weight,
    refOrderId,
    refInventory: inventory,
    warehouse: inventory.warehouse,
    location,
    zone: location.zone,
    orderProductId: inventory.orderProductId,
    status: inventory.status,
    creator: user,
    updater: user
  })
}
