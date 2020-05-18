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
    super(trxMgr, orderVas, params, context)
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
        -(inventory.qty - newInventory.qty),
        -(inventory.weight - newInventory.weight),
        this.user,
        this.trxMgr
      )
      repackedPallet.inventory = newInventory
    }

    await this.updateOperationGuide(refOrder, totalPackageQty)

    if (refOrder instanceof ReleaseGood) {
      await this.updateLoadingWorksheet(inventory, refOrder, remainQty, remainWeight)
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

  async updateOperationGuide(refOrder: RefOrderType, totalPackageQty: number): Promise<void> {
    const ovRepo: Repository<OrderVas> = this.trxMgr.getRepository(OrderVas)
    const wsRepo: Repository<Worksheet> = this.trxMgr.getRepository(Worksheet)
    const wsdRepo: Repository<WorksheetDetail> = this.trxMgr.getRepository(WorksheetDetail)

    let where: {
      arrivalNotice?: ArrivalNotice
      releaseGood?: ReleaseGood
      vasOrder?: VasOrder
      shippingOrder?: ShippingOrder
    }
    if (refOrder instanceof ArrivalNotice) {
      where.arrivalNotice = refOrder
    } else if (refOrder instanceof ReleaseGood) {
      where.releaseGood = refOrder
    } else if (refOrder instanceof VasOrder) {
      where.vasOrder = refOrder
    } else if (refOrder instanceof ShippingOrder) {
      where.shippingOrder = refOrder
    }

    const worksheet: Worksheet = await wsRepo.findOne({
      where,
      relations: ['worksheetDetails', 'worksheetDetails.targetVas', 'worksheetDetails.targetVas.vas']
    })

    let worksheetDetails: WorksheetDetail[] = worksheet.worksheetDetails
    let relatedOrderVas: OrderVas[] = worksheetDetails
      .map((wsd: WorksheetDetail) => wsd.targetVas)
      .filter((targetVas: OrderVas) => targetVas.set === this.orderVas.set && targetVas.vas.id === this.orderVas.vas.id)

    const updatedOperationGuideData: OperationGuideDataInterface = {
      ...this.operationGuideData,
      packageQty: this.operationGuideData.packageQty - totalPackageQty
    }

    relatedOrderVas = relatedOrderVas.map((orderVas: OrderVas) => {
      let operationGuide: {
        data: OperationGuideDataInterface
        [key: string]: any
      } = JSON.parse(orderVas.operationGuide)
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
        return { ...wsd, status: WORKSHEET_STATUS.DONE, updater: this.user }
      })

      await wsdRepo.save(worksheetDetails)

      // Update vas
      relatedOrderVas = relatedOrderVas.map((ov: OrderVas) => {
        return {
          ...ov,
          status: ORDER_VAS_STATUS.COMPLETED,
          updater: this.user
        }
      })
      await ovRepo.save(relatedOrderVas)
    }
  }

  async updateLoadingWorksheet(
    inventory: Inventory,
    refOrder: ReleaseGood,
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
