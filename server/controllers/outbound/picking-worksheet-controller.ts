import { Bizplace } from '@things-factory/biz-base'
import { Product } from '@things-factory/product-base'
import {
  OrderInventory,
  OrderNoGenerator,
  OrderVas,
  ORDER_INVENTORY_STATUS,
  ORDER_STATUS,
  ReleaseGood
} from '@things-factory/sales-base'
import { Inventory, INVENTORY_STATUS, INVENTORY_TRANSACTION_TYPE, Location } from '@things-factory/warehouse-base'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../constants'
import { Worksheet, WorksheetDetail } from '../../entities'
import { VasWorksheetController } from '../vas/vas-worksheet-controller'

export class PickingWorksheetController extends VasWorksheetController {
  async generatePickingWorksheet(releaseGoodNo: string): Promise<Worksheet> {
    let releaseGood: ReleaseGood = await this.findRefOrder(
      ReleaseGood,
      {
        domain: this.domain,
        name: releaseGoodNo,
        status: ORDER_STATUS.PENDING_RECEIVE
      },
      ['orderInventories', 'orderInventories.inventory', 'orderVass']
    )
    const orderInventories: OrderInventory[] = releaseGood.orderInventories
    const orderVASs: OrderVas[] = releaseGood.orderVass

    let worksheet: Worksheet = await this.createWorksheet(releaseGood, WORKSHEET_TYPE.PICKING)

    if (orderInventories.every((oi: OrderInventory) => oi.inventory?.id) || releaseGood.crossDocking) {
      worksheet.worksheetDetails = await this.createWorksheetDetails(
        worksheet,
        WORKSHEET_TYPE.PICKING,
        orderInventories
      )
    }

    orderInventories.forEach((oi: OrderInventory) => {
      oi.status =
        oi.crossDocking || oi.inventory?.id
          ? ORDER_INVENTORY_STATUS.READY_TO_PICK
          : ORDER_INVENTORY_STATUS.PENDING_SPLIT
      oi.updater = this.user
    })
    await this.updateOrderTargets(orderInventories)

    if (orderVASs?.length > 0) {
      await this.generateVasWorksheet(releaseGood)
    }

    releaseGood.status = ORDER_STATUS.READY_TO_PICK
    releaseGood.acceptedBy = this.user
    releaseGood.updater = this.user
    await this.updateRefOrder(releaseGood)

    return worksheet
  }

  async generatePickingWorksheetDetail(
    worksheet: Worksheet,
    targetInventory: Partial<OrderInventory>[]
  ): Promise<WorksheetDetail[]> {
    // Create worksheet details
    return await this.createWorksheetDetails(worksheet, WORKSHEET_TYPE.PICKING, [targetInventory])
  }

  async activatePicking(worksheetNo: string): Promise<Worksheet> {
    let worksheet: Worksheet = await this.findActivatableWorksheet(worksheetNo, WORKSHEET_TYPE.PICKING, [
      'releaseGood',
      'worksheetDetails',
      'worksheetDetails.targetInventory'
    ])

    const worksheetDetails: WorksheetDetail[] = worksheet.worksheetDetails.filter(x => x.status == 'DEACTIVATED')
    const targetInventories: OrderInventory[] = worksheetDetails.map((wsd: WorksheetDetail) => {
      let targetInventory: OrderInventory = wsd.targetInventory
      targetInventory.status = ORDER_INVENTORY_STATUS.PICKING
      targetInventory.updater = this.user
      return targetInventory
    })
    this.updateOrderTargets(targetInventories)

    let releaseGood: ReleaseGood = worksheet.releaseGood
    releaseGood.status = ORDER_STATUS.PICKING
    releaseGood.updater = this.user
    this.updateRefOrder(releaseGood)

    worksheet = await this.activateWorksheet(worksheet, worksheetDetails, [])

    try {
      const vasWorksheet: Worksheet = await this.findWorksheetByRefOrder(releaseGood, WORKSHEET_TYPE.VAS)
      if (vasWorksheet) {
        await this.activateVAS(vasWorksheet.name, vasWorksheet.worksheetDetails)
      }
    } catch (e) {}

    const pendingSplitOIs: OrderInventory[] = await this.trxMgr.getRepository(OrderInventory).find({
      where: { domain: this.domain, releaseGood, status: ORDER_INVENTORY_STATUS.PENDING_SPLIT }
    })
    if (pendingSplitOIs?.length) {
      const ids: string[] = pendingSplitOIs.map((oi: OrderInventory) => oi.id)
      await this.trxMgr.getRepository(OrderInventory).delete(ids)
    }

    return worksheet
  }

  async assignPickingInventories(
    worksheetNo: string,
    batchId: string,
    productId: string,
    packingType: string,
    worksheetDetails: Partial<WorksheetDetail>[]
  ): Promise<void> {
    // 1. Remove prev worksheet details if it's exists
    const worksheet: Worksheet = await this.findWorksheetByNo(worksheetNo, [
      'bizplace',
      'releaseGood',
      'worksheetDetails'
    ])
    const releaseGood: ReleaseGood = worksheet.releaseGood
    const bizplace: Bizplace = worksheet.bizplace
    const prevWorksheetDetails: WorksheetDetail[] = await this.extractMatchedWorksheetDetails(
      worksheet.worksheetDetails,
      batchId,
      productId,
      packingType
    )
    // Delete order inventories
    if (prevWorksheetDetails?.length) {
      const worksheetDetailIds: string[] = prevWorksheetDetails.map((wsd: WorksheetDetail) => wsd.id)
      const prevTargetInventoryIds: string[] = prevWorksheetDetails.map(
        (wsd: WorksheetDetail) => wsd.targetInventory.id
      )

      await this.trxMgr.getRepository(WorksheetDetail).delete(worksheetDetailIds)
      await this.trxMgr.getRepository(OrderInventory).delete(prevTargetInventoryIds)
    }

    for (let worksheetDetail of worksheetDetails) {
      if (worksheetDetail.targetInventory?.inventory?.id) {
        worksheetDetail = await this.findWorksheetDetail(worksheetDetail, [
          'targetInventory',
          'targetInventory.inventory'
        ])
      }

      const targetInventory: OrderInventory = worksheetDetail.targetInventory
      let inventory: Inventory = await this.trxMgr.getRepository(Inventory).findOne(targetInventory.inventory.id)
      const product: Product = await this.trxMgr.getRepository(Product).findOne(productId)

      // Create order inventories
      let newTargetInventory: OrderInventory = Object.assign({}, targetInventory)
      delete newTargetInventory.id
      newTargetInventory.domain = this.domain
      newTargetInventory.bizplace = bizplace
      newTargetInventory.name = OrderNoGenerator.orderInventory()
      newTargetInventory.releaseGood = releaseGood
      newTargetInventory.inventory = inventory
      newTargetInventory.batchId = batchId
      newTargetInventory.product = product
      newTargetInventory.packingType = packingType
      newTargetInventory.creator = this.user
      newTargetInventory.updater = this.user
      newTargetInventory = await this.trxMgr.getRepository(OrderInventory).save(newTargetInventory)

      // Update locked qty and weight of inventory
      inventory.lockedQty = targetInventory.releaseQty + (inventory.lockedQty || 0)
      inventory.lockedWeight = targetInventory.releaseWeight + (inventory.lockedWeight || 0)
      await this.updateInventory(inventory)

      // Create worksheet details
      await this.createWorksheetDetails(worksheet, WORKSHEET_TYPE.PICKING, [newTargetInventory])
    }
  }

  async undoPickingAssigment(
    worksheetNo: string,
    batchId: string,
    productId: string,
    packingType: string
  ): Promise<void> {
    const worksheet: Worksheet = await this.findWorksheetByNo(worksheetNo, [
      'worksheetDetails',
      'worksheetDetails.targetInventory',
      'worksheetDetails.targetInventory.inventory',
      'worksheetDetails.targetInventory.product'
    ])
    const worksheetDetails: WorksheetDetail[] = await this.extractMatchedWorksheetDetails(
      worksheet.worksheetDetails,
      batchId,
      productId,
      packingType,
      ['targetInventory', 'targetInventory.inventory']
    )

    let worksheetDetailIds: string[] = []
    let targetInventoryIds: string[] = []

    for (const worksheetDetail of worksheetDetails) {
      worksheetDetailIds.push(worksheetDetail.id)
      const targetInventory: OrderInventory = worksheetDetail.targetInventory
      targetInventoryIds.push(targetInventory.id)

      let inventory: Inventory = worksheetDetail.targetInventory.inventory
      inventory.lockedQty -= targetInventory.releaseQty
      inventory.lockedWeight -= targetInventory.releaseWeight
      await this.updateInventory(inventory)
    }

    await this.trxMgr.getRepository(WorksheetDetail).delete(worksheetDetailIds)
    await this.trxMgr.getRepository(OrderInventory).delete(targetInventoryIds)
  }

  async picking(
    worksheetDetailName: string,
    palletId: string,
    locationName: string,
    releaseQty: number
  ): Promise<void> {
    let worksheetDetail: WorksheetDetail = await this.findExecutableWorksheetDetailByName(
      worksheetDetailName,
      WORKSHEET_TYPE.PICKING,
      [
        'worksheet',
        'worksheet.releaseGood',
        'targetInventory',
        'targetInventory.inventory',
        'targetInventory.inventory.location'
      ]
    )
    const releaseGood: ReleaseGood = worksheetDetail.worksheet.releaseGood
    let targetInventory: OrderInventory = worksheetDetail.targetInventory
    let inventory: Inventory = targetInventory.inventory
    if (inventory.palletId !== palletId)
      throw new Error(this.ERROR_MSG.VALIDITY.UNEXPECTED_FIELD_VALUE('Pallet ID', palletId, inventory.palletId))

    const leftQty: number = inventory.qty - releaseQty
    if (leftQty < 0) {
      throw new Error(this.ERROR_MSG.VALIDITY.CANT_PROCEED_STEP_BY('picking', `quantity can't exceed limitation`))
    }

    targetInventory.status = ORDER_INVENTORY_STATUS.PICKED
    await this.updateOrderTargets([targetInventory])

    inventory.qty -= targetInventory.releaseQty
    inventory.weight = Math.round((inventory.weight - targetInventory.releaseWeight) * 100) / 100
    inventory.lockedQty = inventory.lockedQty - targetInventory.releaseQty
    inventory.lockedWeight = Math.round((inventory.lockedWeight - targetInventory.releaseWeight) * 100) / 100
    inventory = await this.transactionInventory(
      inventory,
      releaseGood,
      -targetInventory.releaseQty,
      -targetInventory.releaseWeight,
      INVENTORY_TRANSACTION_TYPE.PICKING
    )

    worksheetDetail.status = WORKSHEET_STATUS.DONE
    worksheetDetail.updater = this.user
    await this.trxMgr.getRepository(WorksheetDetail).save(worksheetDetail)

    if (leftQty === 0) {
      inventory.status = INVENTORY_STATUS.TERMINATED
      await this.transactionInventory(inventory, releaseGood, 0, 0, INVENTORY_TRANSACTION_TYPE.TERMINATED)
    }

    const fromLocation: Location = targetInventory.inventory.location
    if (locationName) {
      const toLocation: Location = await this.trxMgr.getRepository(Location).findOne({
        where: { domain: this.domain, name: locationName },
        relations: ['warehouse']
      })

      if (!toLocation) throw new Error(this.ERROR_MSG.FIND.NO_RESULT(locationName))

      if (fromLocation.id !== toLocation.id) {
        inventory.location = toLocation
        inventory.warehouse = toLocation.warehouse
        inventory.zone = toLocation.zone
        inventory = await this.transactionInventory(inventory, releaseGood, 0, 0, INVENTORY_TRANSACTION_TYPE.RELOCATE)
      }
    }
  }

  async completePicking(releaseGoodNo: string): Promise<Worksheet> {
    let releaseGood: ReleaseGood = await this.findRefOrder(ReleaseGood, {
      domain: this.domain,
      name: releaseGoodNo,
      status: ORDER_STATUS.PICKING
    })

    const worksheet: Worksheet = await this.findWorksheetByRefOrder(releaseGood, WORKSHEET_TYPE.PICKING, [
      'worksheetDetails',
      'worksheetDetails.targetInventory'
    ])
    this.checkRecordValidity(worksheet, { status: WORKSHEET_STATUS.EXECUTING })

    return await this.completeWorksheet(worksheet, ORDER_STATUS.LOADING)
  }

  private async extractMatchedWorksheetDetails(
    worksheetDetails: Partial<WorksheetDetail[]>,
    standardBatchId: string,
    standardProductId: string,
    standardPackingType: string,
    relations: string[] = ['targetInventory', 'targetInventory.product']
  ): Promise<WorksheetDetail[]> {
    for (let wsd of worksheetDetails) {
      if (!wsd.targetInventory?.batchId || !wsd.targetInventory?.product?.id || !wsd.targetInventory?.packingType) {
        wsd = await this.findWorksheetDetail(wsd, ['targetInventory', 'targetInventory.product'])
      }
    }

    worksheetDetails = worksheetDetails.filter(
      (wsd: WorksheetDetail) =>
        wsd.targetInventory.batchId === standardBatchId &&
        wsd.targetInventory.product.id === standardProductId &&
        wsd.targetInventory.packingType === standardPackingType
    )

    for (let wsd of worksheetDetails) {
      wsd = await this.findWorksheetDetail(wsd, relations)
    }

    return worksheetDetails
  }
}
