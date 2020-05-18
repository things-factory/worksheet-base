import {
  OrderInventory,
  OrderNoGenerator,
  OrderVas,
  ORDER_INVENTORY_STATUS,
  ReleaseGood
} from '@things-factory/sales-base'
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
import { AbstractVasTransaction, RefOrderType } from './AbstractVasTransaction'

interface OperationGuideDataInterface {
  packingUnit: string
  toPackingType: string
  stdAmount: number
  packageQty: number
}

interface RepackPalletInterface {
  palletId: string
  locationName: string
  packageQty: number
  inventory?: Inventory
}

export class Repack extends AbstractVasTransaction<OperationGuideDataInterface, RepackPalletInterface[]> {
  constructor(trxMgr: EntityManager, orderVas: OrderVas, params: any, context: any) {
    super(trxMgr, orderVas, params, context, true)
  }

  async exec(): Promise<void> {
    const oiRepo: Repository<OrderInventory> = this.trxMgr.getRepository(OrderInventory)
    const ovRepo: Repository<OrderVas> = this.trxMgr.getRepository(OrderVas)
    const invRepo: Repository<Inventory> = this.trxMgr.getRepository(Inventory)

    this.orderVas = await ovRepo.findOne(this.orderVas.id, {
      relations: ['inventory']
    })

    let inventory: Inventory = this.orderVas.inventory
    const refOrder: RefOrderType = await this.getRefOrder()

    // If vas order comes with release good and whole products of target pallet is picked
    if (refOrder instanceof ReleaseGood && inventory.status === INVENTORY_STATUS.TERMINATED) {
      const orderInv: OrderInventory = await oiRepo.findOne({
        where: {
          domain: this.domain,
          bizplace: this.bizplace,
          inventory,
          releaseGood: refOrder,
          status: ORDER_INVENTORY_STATUS.PICKED
        }
      })
      inventory.qty = orderInv.releaseQty
      inventory.weight = orderInv.releaseWeight
    }

    const totalPackageQty: number = this.getTotalPackageQty()
    const { remainQty, remainWeight } = this.calcRemainAmout(inventory, totalPackageQty)
    // If order comes with release order and whole products of target pallet is picekd then
    // status of inventory is changed to TERMINATED already.
    // No need to change qty, weight and status inventory
    // creating inventory history is only needed.
    if (inventory.status === INVENTORY_STATUS.TERMINATED && (remainQty <= 0 || remainWeight <= 0)) {
      await generateInventoryHistory(
        inventory,
        refOrder,
        INVENTORY_TRANSACTION_TYPE.REPACKAGING,
        0,
        0,
        this.user,
        this.trxMgr
      )
    } else {
      // Common case
      await invRepo.save({
        ...inventory,
        qty: remainQty,
        weight: remainWeight,
        status: INVENTORY_STATUS.TERMINATED,
        updater: this.user
      })
      await generateInventoryHistory(
        inventory,
        refOrder,
        INVENTORY_TRANSACTION_TYPE.REPACKAGING,
        -inventory.qty - remainQty,
        -inventory.weight - remainWeight,
        this.user,
        this.trxMgr
      )
    }

    for (const repackedPallet of this.params) {
      const newInventory: Inventory = await this.createInventory(repackedPallet, inventory, refOrder.id)
      await generateInventoryHistory(
        newInventory,
        refOrder,
        INVENTORY_TRANSACTION_TYPE.REPACKAGING,
        newInventory.qty,
        newInventory.weight,
        this.user,
        this.trxMgr
      )
      repackedPallet.inventory = newInventory
    }

    if (refOrder instanceof ReleaseGood) {
      await this.updateLoadingWorksheet(refOrder, inventory, remainQty, remainWeight)
    }
  }

  getUpdatedOperationGuideData(): { data: OperationGuideDataInterface; completed: boolean } {
    const totalPackageQty: number = this.getTotalPackageQty()
    return {
      data: {
        ...this.operationGuideData,
        packageQty: this.operationGuideData.packageQty - totalPackageQty
      },
      completed: !Boolean(this.operationGuideData.packageQty - totalPackageQty)
    }
  }

  getTotalPackageQty(): number {
    return this.params.reduce(
      (totalAmount: number, repackedPallet: RepackPalletInterface): number =>
        (totalAmount += repackedPallet.packageQty * this.operationGuideData.stdAmount),
      0
    )
  }

  calcRemainAmout(inventory: Inventory, totalPackedAmount: number): { remainQty: number; remainWeight: number } {
    const packingUnit: string = this.operationGuideData.packingUnit
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

  calcWeight(repackedPallet: RepackPalletInterface, inventory: Inventory): number {
    const packingUnit: string = this.operationGuideData.packingUnit
    const stdAmount: number = this.operationGuideData.stdAmount
    let weight: number

    if (packingUnit === 'WEIGHT') {
      weight = stdAmount * repackedPallet.packageQty
    } else if (packingUnit === 'QTY') {
      weight = (inventory.weight / inventory.qty) * stdAmount * repackedPallet.packageQty
    }
    return weight
  }

  async createInventory(
    repackedPallet: RepackPalletInterface,
    inventory: Inventory,
    refOrderId: string
  ): Promise<Inventory> {
    const locRepo: Repository<Location> = this.trxMgr.getRepository(Location)
    const invRepo: Repository<Inventory> = this.trxMgr.getRepository(Inventory)

    const weight: number = this.calcWeight(repackedPallet, inventory)
    const packingType: string = this.operationGuideData.toPackingType
    inventory = await invRepo.findOne(inventory.id, { relations: ['product', 'warehouse', 'orderProduct'] })
    const location: Location = await locRepo.findOne({
      where: { domain: this.domain, name: repackedPallet.locationName }
    })

    return await invRepo.save({
      domain: this.domain,
      bizplace: this.bizplace,
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
      creator: this.user,
      updater: this.user
    })
  }

  async updateLoadingWorksheet(
    refOrder: ReleaseGood,
    inventory: Inventory,
    remainQty: number,
    remainWeight: number
  ): Promise<void> {
    const oiRepo: Repository<OrderInventory> = this.trxMgr.getRepository(OrderInventory)
    const wsdRepo: Repository<WorksheetDetail> = this.trxMgr.getRepository(WorksheetDetail)

    const loadingOrdInv: OrderInventory = await oiRepo.findOne({
      where: { domain: this.domain, bizplace: this.bizplace, inventory, releaseGood: refOrder }
    })
    const loadingWSD: WorksheetDetail = await wsdRepo.findOne({
      where: {
        domain: this.domain,
        bizplace: this.bizplace,
        targetInventory: loadingOrdInv,
        type: WORKSHEET_TYPE.LOADING
      },
      relations: ['worksheet']
    })

    if (remainQty <= 0 || remainWeight <= 0) {
      await wsdRepo.delete(loadingWSD.id)
    } else {
      await oiRepo.save({ ...loadingOrdInv, releaseWeight: remainWeight, releaseQty: remainQty })
    }

    await this.createLoadingWorksheets(refOrder, loadingOrdInv, loadingWSD)
  }

  async createLoadingWorksheets(
    releaseGood: ReleaseGood,
    originOrderInv: OrderInventory,
    originWSD: WorksheetDetail
  ): Promise<void> {
    const wsRepo: Repository<Worksheet> = this.trxMgr.getRepository(Worksheet)
    const wsdRepo: Repository<WorksheetDetail> = this.trxMgr.getRepository(WorksheetDetail)
    const oiRepo: Repository<OrderInventory> = this.trxMgr.getRepository(OrderInventory)

    const originWS: Worksheet = await wsRepo.findOne(originWSD.worksheet.id)

    delete originOrderInv.id
    delete originWSD.id

    // Create order inventories
    let orderInventories: OrderInventory[] = await Promise.all(
      this.params.map(async (repackedPallet: RepackPalletInterface) => {
        return {
          ...originOrderInv,
          domain: this.domain,
          bizplace: this.bizplace,
          name: OrderNoGenerator.orderInventory(),
          inventory: repackedPallet.inventory,
          releaseGood,
          releaseQty: repackedPallet.inventory.qty,
          releaseWeight: repackedPallet.inventory.weight,
          packingType: repackedPallet.inventory.packingType,
          creator: this.user,
          updater: this.user
        }
      })
    )

    orderInventories = await oiRepo.save(orderInventories)

    const worksheetDetails: WorksheetDetail[] = orderInventories.map(
      (targetInventory: OrderInventory): WorksheetDetail => {
        return {
          domain: this.domain,
          bizplace: this.bizplace,
          worksheet: originWS,
          name: WorksheetNoGenerator.loadingDetail(),
          targetInventory,
          type: WORKSHEET_TYPE.LOADING,
          status: WORKSHEET_STATUS.DEACTIVATED,
          creator: this.user,
          updater: this.user
        } as WorksheetDetail
      }
    )

    await wsdRepo.save(worksheetDetails)
  }
}
