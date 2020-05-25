import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import { OrderVas, ReleaseGood } from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import {
  Inventory,
  InventoryNoGenerator,
  INVENTORY_STATUS,
  INVENTORY_TRANSACTION_TYPE,
  Location,
  Warehouse
} from '@things-factory/warehouse-base'
import { EntityManager } from 'typeorm'
import { generateInventoryHistory } from '../../../../utils'
import { OperationGuideDataInterface, OperationGuideInterface, RefOrderType, RepalletizedInvInfo } from './intefaces'

export async function completeRepalletizing(trxMgr: EntityManager, orderVas: OrderVas, user: User): Promise<void> {
  orderVas = await trxMgr.getRepository(OrderVas).findOne(orderVas.id, {
    relations: [
      'domain',
      'bizplace',
      'inventory',
      'inventory.product',
      'arrivalNotice',
      'releaseGood',
      'shippingOrder',
      'vasOrder'
    ]
  })
  const domain: Domain = orderVas.domain
  const bizplace: Bizplace = orderVas.bizplace
  let originInv: Inventory = orderVas.inventory
  const operationGuide: OperationGuideInterface = JSON.parse(orderVas.operationGuide)
  const operationGuideData: OperationGuideDataInterface = operationGuide.data

  const repalletizedInvs: RepalletizedInvInfo[] = operationGuideData.repalletizedInvs

  let refOrder: RefOrderType
  if (orderVas.arrivalNotice) {
    refOrder = orderVas.arrivalNotice
  } else if (orderVas.releaseGood) {
    refOrder = orderVas.releaseGood
  } else if (orderVas.shippingOrder) {
    refOrder = orderVas.shippingOrder
  } else if (orderVas.vasOrder) {
    refOrder = orderVas.vasOrder
  }

  for (let repalletizedInv of repalletizedInvs) {
    const palletId: string = repalletizedInv.palletId
    const addedQty: number = repalletizedInv.addedQty
    const addedWeight: number = repalletizedInv.addedWeight
    const locationName: string = repalletizedInv.locationName
    // Try to find inventory by pallet ID and domain, bizplace
    const inv: Inventory = await trxMgr.getRepository(Inventory).findOne({
      where: { domain, bizplace, palletId }
    })

    if (inv) {
      // Inventory exists
      await updateInv(refOrder, trxMgr, domain, inv, addedQty, addedWeight, locationName, updateInv)
    } else {
      // Inventory doesn't exists
      await createInv(
        refOrder,
        trxMgr,
        domain,
        bizplace,
        palletId,
        originInv,
        addedQty,
        addedWeight,
        locationName,
        user
      )
    }

    originInv = await deductInventoryQty(trxMgr, refOrder, originInv, addedQty, addedWeight, user)
  }

  // Check whether original inv has qty or not.
  if (originInv.qty < 0 || originInv.weight < 0) throw new Error('Deducted amount of inventory value is negative')
  if ((originInv.qty == 0 && originInv.weight != 0) || (originInv.weight == 0 && originInv.qty != 0))
    throw new Error('Unbalanced amount of inventory.')

  // If there's no more qty of products => Terminate inventory
  if (originInv.qty == 0 && originInv.weight == 0) {
    await terminateEmptyInventory(trxMgr, refOrder, originInv, user)
  }
}

async function terminateEmptyInventory(
  trxMgr: EntityManager,
  refOrder: RefOrderType,
  inventory: Inventory,
  user: User
): Promise<void> {
  if (refOrder instanceof ReleaseGood) {
    console.log('Terminate empty inventory')
  } else {
    inventory = await trxMgr.getRepository(Inventory).save({
      ...inventory,
      status: INVENTORY_STATUS.TERMINATED,
      updater: user
    })

    await generateInventoryHistory(inventory, refOrder, INVENTORY_TRANSACTION_TYPE.REPALLETIZING, 0, 0, user, trxMgr)
  }
}

async function deductInventoryQty(
  trxMgr: EntityManager,
  refOrder: RefOrderType,
  originInv: Inventory,
  addedQty: number,
  addedWeight: number,
  user: User
): Promise<Inventory> {
  if (refOrder instanceof ReleaseGood) {
  } else {
    originInv = await trxMgr.getRepository(Inventory).save({
      ...originInv,
      qty: originInv.qty - addedQty,
      weight: originInv.weight - addedWeight,
      updater: user
    })

    await generateInventoryHistory(
      originInv,
      refOrder,
      INVENTORY_TRANSACTION_TYPE.REPALLETIZING,
      -addedQty,
      -addedWeight,
      user,
      trxMgr
    )
  }

  return originInv
}

async function updateInv(
  refOrder: RefOrderType,
  trxMgr: EntityManager,
  domain: Domain,
  inv: Inventory,
  addedQty: number,
  addedWeight: number,
  locationName: string,
  user: User
): Promise<void> {
  const location: Location = await trxMgr.getRepository(Location).findOne({
    where: { domain, name: locationName },
    relations: ['warehouse']
  })
  const warehouse: Warehouse = location.warehouse
  const zone: string = location.zone

  if (refOrder instanceof ReleaseGood) {
    // Ref Order is Release Good
    console.log('Case for inv exists and ref RO')
  } else {
    // Add qty and weight
    await trxMgr.getRepository(Inventory).save({
      ...inv,
      qty: inv.qty + addedQty,
      weight: inv.weight + addedWeight,
      location,
      warehouse,
      zone,
      updater: user
    })
  }
}

async function createInv(
  refOrder: RefOrderType,
  trxMgr: EntityManager,
  domain: Domain,
  bizplace: Bizplace,
  palletId: string,
  originInv: Inventory,
  addedQty: number,
  addedWeight: number,
  locationName: Location,
  user: User
): Promise<void> {
  const location: Location = await trxMgr.getRepository(Location).findOne({
    where: { domain, name: locationName },
    relations: ['warehouse']
  })
  const warehouse: Warehouse = location.warehouse
  const zone: string = location.zone

  if (refOrder instanceof ReleaseGood) {
    // Ref Order is Release Good
    console.log(`Case for inv doesn't exists and ref RO`)
  } else {
    // Create new Inventory
    const newInv: Inventory = await trxMgr.getRepository(Inventory).save({
      domain,
      bizplace,
      palletId,
      batchId: originInv.batchId,
      name: InventoryNoGenerator.inventoryName(),
      product: originInv.product,
      packingType: originInv.packingType,
      qty: addedQty,
      weight: addedWeight,
      refOrderId: originInv.refOrderId,
      warehouse,
      location,
      zone,
      status: originInv.status,
      orderProductId: originInv.orderProductId,
      creator: user,
      updater: user
    })
    // Create inventory history
    await generateInventoryHistory(
      newInv,
      refOrder,
      INVENTORY_TRANSACTION_TYPE.REPALLETIZING,
      addedQty,
      addedWeight,
      user,
      trxMgr
    )
  }
}
