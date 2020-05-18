import { OrderInventory, OrderNoGenerator, OrderVas, ReleaseGood } from '@things-factory/sales-base'
import { Inventory, InventoryNoGenerator, INVENTORY_TRANSACTION_TYPE, Location } from '@things-factory/warehouse-base'
import { EntityManager, Repository } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../constants'
import { Worksheet, WorksheetDetail } from '../../entities'
import { generateInventoryHistory, WorksheetNoGenerator } from '../../utils'
import { AbstractVasTransaction, RefOrderType } from './AbstractVasTransaction'

interface OperationGuideDataInterface {
  palletType: string
  stdQty: number
  palletQty: number
}

interface CompleteParamInterface {
  palletId: string
  locationName: string
  packageQty: number
  inventory?: Inventory
}

export class Repalletizing extends AbstractVasTransaction<OperationGuideDataInterface, CompleteParamInterface[]> {
  constructor(trxMgr: EntityManager, orderVas: OrderVas, params: string, context: any) {
    super(trxMgr, orderVas, params, context, true)
  }

  async exec(): Promise<void> {
    const ovRepo: Repository<OrderVas> = this.trxMgr.getRepository(OrderVas)
    this.orderVas = await ovRepo.findOne(this.orderVas.id, {
      relations: ['inventory']
    })

    let inventory: Inventory = this.orderVas.inventory
    const totalPackageQty: number = this.getTotalPackQty()
    // validate for qty
    if (inventory.qty < totalPackageQty)
      throw new Error(`Repalletized package qty is exceed qty of its original inventory (${inventory.palletId})`)

    const refOrder: RefOrderType = await this.getRefOrder()
    for (const pallet of this.params) {
      const newInventory: Inventory = await this.createNewInventory(pallet, inventory, refOrder.id)
      await generateInventoryHistory(
        newInventory,
        refOrder,
        INVENTORY_TRANSACTION_TYPE.REPALLETIZING,
        newInventory.qty,
        newInventory.weight,
        this.user,
        this.trxMgr
      )

      pallet.inventory = newInventory
    }

    if (refOrder instanceof ReleaseGood) {
      const unitWeight = inventory.weight / inventory.qty
      const remainQty = inventory.qty - totalPackageQty
      const remainWeight = inventory.weight - totalPackageQty * unitWeight
      await this.updateLoadingWorksheet(refOrder, inventory, remainQty, remainWeight)
    }
  }

  getUpdatedOperationGuideData(): { data: OperationGuideDataInterface; completed: boolean } {
    const totalPackageQty: number = this.getTotalPackQty()
    return {
      data: {
        ...this.operationGuideData,
        palletQty: this.operationGuideData.palletQty * this.operationGuideData.stdQty - totalPackageQty
      },
      completed: !Boolean(this.operationGuideData.palletQty * this.operationGuideData.stdQty - totalPackageQty)
    }
  }

  getTotalPackQty(): number {
    return this.params.reduce(
      (totalPackQty: number, pallet: CompleteParamInterface): number => (totalPackQty += pallet.packageQty),
      0
    )
  }

  async createNewInventory(
    pallet: CompleteParamInterface,
    inventory: Inventory,
    refOrderId: string
  ): Promise<Inventory> {
    const locRepo: Repository<Location> = this.trxMgr.getRepository(Location)
    const invRepo: Repository<Inventory> = this.trxMgr.getRepository(Inventory)

    const unitWeight: number = inventory.weight / inventory.qty
    const palletId: string = pallet.palletId
    const packingType: string = inventory.packingType
    const qty: number = pallet.packageQty
    const weight: number = pallet.packageQty * unitWeight
    inventory = await invRepo.findOne(inventory.id, { relations: ['product', 'warehouse', 'orderProduct'] })
    const location: Location = await locRepo.findOne({ where: { domain: this.domain, name: pallet.locationName } })

    return await invRepo.save({
      domain: this.domain,
      bizplace: this.bizplace,
      palletId,
      batchId: inventory.batchId,
      name: InventoryNoGenerator.inventoryName(),
      product: inventory.product,
      packingType,
      qty,
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
      this.params.map(async (pallet: CompleteParamInterface) => {
        return {
          ...originOrderInv,
          domain: this.domain,
          bizplace: this.bizplace,
          name: OrderNoGenerator.orderInventory(),
          inventory: pallet.inventory,
          releaseGood,
          releaseQty: pallet.inventory.qty,
          releaseWeight: pallet.inventory.weight,
          packingType: pallet.inventory.packingType,
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
