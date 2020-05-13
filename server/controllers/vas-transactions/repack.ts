import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import {
  ArrivalNotice,
  OrderInventory,
  OrderNoGenerator,
  OrderVas,
  ORDER_INVENTORY_STATUS,
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
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../constants'
import { Worksheet, WorksheetDetail } from '../../entities'
import { generateInventoryHistory, WorksheetNoGenerator } from '../../utils'

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
  inventory?: Inventory
}

enum RefOrderType {
  ArrivalNotice,
  ReleaseGood,
  ShippingOrder,
  VasOrder
}

export async function repack(
  trxMgr: EntityManager,
  orderVas: OrderVas,
  repackedPallets: IRepackedPallet[],
  context: any
) {
  const ovRepo: Repository<OrderVas> = trxMgr.getRepository(OrderVas)
  const oiRepo: Repository<OrderInventory> = trxMgr.getRepository(OrderInventory)
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
  const orderType: RefOrderType = orderVas.arrivalNotice
    ? orderVas.ArrivalNotice
    : orderVas.releaseGood
    ? RefOrderType.ReleaseGood
    : orderVas.shippingOrder
    ? RefOrderType.ShippingOrder
    : RefOrderType.VasOrder

  const refOrder: any = orderVas.arrivalNotice || orderVas.releaseGood || orderVas.shippingOrder || orderVas.vasOrder
  const operationGuideData: IOperationGuideData = JSON.parse(orderVas.operationGuide).data

  const packingUnit: string = operationGuideData.packingUnit
  const toPackingType: string = operationGuideData.toPackingType
  const stdAmount: number = operationGuideData.stdAmount
  const domain: Domain = context.state.domain
  const bizplace: Bizplace = inventory.bizplace
  const user: User = context.state.user

  // If vas order comes with release good and whole products of target pallet is picked
  if (orderType === RefOrderType.ReleaseGood && inventory.status === INVENTORY_STATUS.TERMINATED) {
    const orderInv: OrderInventory = await oiRepo.findOne({
      where: { domain, bizplace, inventory, releaseGood: refOrder, status: ORDER_INVENTORY_STATUS.PICKED }
    })
    inventory.qty = orderInv.releaseQty
    inventory.weight = orderInv.releaseWeight
  }

  const totalPackedAmount = repackedPallets.reduce(
    (totalPackedAmount: number, repackedPallet: IRepackedPallet): number => {
      totalPackedAmount += repackedPallet.packageQty * stdAmount
      return totalPackedAmount
    },
    0
  )

  let isWholeRepack: boolean
  if (packingUnit === 'WEIGHT') {
    if (inventory.weight < totalPackedAmount) throw new Error(`Packed weight can't exceed weight of inventory`)
    isWholeRepack = inventory.weight === totalPackedAmount
  } else if (packingUnit === 'QTY') {
    if (inventory.qty < totalPackedAmount) throw new Error(`Packed qty can't exceed qty of inventory`)
    isWholeRepack = inventory.qty === totalPackedAmount
  }

  // Repack whole inventory
  if (isWholeRepack) {
    // Terminate original pallet.
    if (inventory.stats === INVENTORY_STATUS.TERMINATED) {
      // If order comes with release order and whole products of target pallet is picekd then
      // status of inventory is changed to TERMINATED already.
      // No need to change qty, weight and status inventory
      // creating inventory history is only needed.

      await generateInventoryHistory(inventory, refOrder, INVENTORY_TRANSACTION_TYPE.REPACKAGING, 0, 0, user, trxMgr)
    } else {
      // Common case
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
    }

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

      repackedPallet.inventory = newInventory
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

      repackedPallet.inventory = newInventory
    }
  }

  let wsFindCondition: {
    arrivalNotice?: ArrivalNotice
    releaseGood?: ReleaseGood
    vasOrder?: VasOrder
    shippingOrder?: ShippingOrder
    type: String
  } = {
    type: WORKSHEET_TYPE.VAS
  }

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
    await ovRepo.save(relatedOrderVas)

    if (orderType === RefOrderType.ReleaseGood) {
      const oiRepo: Repository<OrderInventory> = trxMgr.getRepository(OrderInventory)

      const loadingOrdInv: OrderInventory = await oiRepo.findOne({
        where: {
          domain,
          bizplace,
          inventory,
          releaseGood: refOrder
        }
      })

      const loadingWSD: WorksheetDetail = await wsdRepo.findOne({
        where: {
          domain,
          bizplace,
          targetInventory: loadingOrdInv,
          type: WORKSHEET_TYPE.LOADING
        },
        relations: ['worksheet']
      })

      if (isWholeRepack) {
        // delete loading worksheet detail and order inventories for loading
        await oiRepo.delete(loadingOrdInv.id)
        await wsdRepo.delete(loadingWSD.id)
      } else {
        // change qty of worksheet and order inventories for loading
        const { remainWeight, remainQty } = calcRemainAmount(packingUnit, inventory, totalPackedAmount)
        await oiRepo.save({
          ...loadingOrdInv,
          releaseWeight: remainWeight,
          releaseQty: remainQty
        })
      }

      await createLoadingWorksheets(trxMgr, domain, bizplace, repackedPallets, loadingOrdInv, loadingWSD, user)
    }
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

async function createLoadingWorksheets(
  trxMgr: EntityManager,
  domain: Domain,
  bizplace: Bizplace,
  repackedPallets: IRepackedPallet[],
  originOrderInv: OrderInventory,
  originWSD: WorksheetDetail,
  user: User
): Promise<void> {
  const oiRepo: Repository<OrderInventory> = trxMgr.getRepository(OrderInventory)
  const wsRepo: Repository<Worksheet> = trxMgr.getRepository(Worksheet)
  const wsdRepo: Repository<WorksheetDetail> = trxMgr.getRepository(WorksheetDetail)

  const originWS: Worksheet = await wsRepo.findOne(originWSD.worksheet.id)

  delete originOrderInv.id
  delete originWSD.id

  // Create order inventories
  let orderInventories: OrderInventory[] = await Promise.all(
    repackedPallets.map(async (repackedPallet: IRepackedPallet) => {
      return {
        ...originOrderInv,
        domain,
        bizplace,
        name: OrderNoGenerator.orderInventory(),
        inventory: repackedPallet.inventory,
        releaseQty: repackedPallet.inventory.qty,
        releaseWeight: repackedPallet.inventory.weight,
        packingType: repackedPallet.inventory.packingType,
        creator: user,
        updater: user
      }
    })
  )

  orderInventories = await oiRepo.save(orderInventories)

  const worksheetDetails: WorksheetDetail[] = orderInventories.map(
    (targetInventory: OrderInventory): WorksheetDetail => {
      return {
        domain,
        bizplace,
        worksheet: originWS,
        name: WorksheetNoGenerator.loadingDetail(),
        targetInventory,
        type: WORKSHEET_TYPE.LOADING,
        status: WORKSHEET_STATUS.DEACTIVATED,
        creator: user,
        updater: user
      } as WorksheetDetail
    }
  )

  await wsdRepo.save(worksheetDetails)
}
