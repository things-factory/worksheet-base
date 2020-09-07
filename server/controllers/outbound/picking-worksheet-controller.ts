import { Bizplace } from '@things-factory/biz-base'
import { OrderInventory, OrderVas, ORDER_INVENTORY_STATUS, ORDER_STATUS, ReleaseGood } from '@things-factory/sales-base'
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
      ['bizplace', 'orderInventories', 'orderInventories.inventory', 'orderVass']
    )
    const bizplace: Bizplace = releaseGood.bizplace
    const orderInventories: OrderInventory[] = releaseGood.orderInventories
    const orderVASs: OrderVas[] = releaseGood.orderVass

    let worksheet: Worksheet = await this.createWorksheet(bizplace, releaseGood, WORKSHEET_TYPE.PICKING)

    if (orderInventories.every((oi: OrderInventory) => oi.inventory?.id) || releaseGood.crossDocking) {
      worksheet.worksheetDetails = await this.createWorksheetDetails(
        worksheet,
        WORKSHEET_TYPE.PICKING,
        orderInventories
      )

      const inventories: Inventory[] = orderInventories.map((oi: OrderInventory) => {
        let inventory: Inventory = oi.inventory
        inventory.lockedQty = oi.releaseQty
        inventory.lockedWeight = oi.releaseWeight
        inventory.updater = this.user
      })

      await this.trxMgr.getRepository(Inventory).save(inventories)
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
    releaseGood.updater = this.user
    await this.updateRefOrder(releaseGood)

    return worksheet
  }

  async activatePicking(worksheetNo: string): Promise<Worksheet> {
    let worksheet: Worksheet = await this.findActivatableWorksheet(worksheetNo, WORKSHEET_TYPE.PICKING, [
      'releaseGood',
      'worksheetDetails',
      'worksheetDestails.targetInventory'
    ])

    const worksheetDestails: WorksheetDetail[] = worksheet.worksheetDetails
    const targetInventories: OrderInventory[] = worksheetDestails.map((wsd: WorksheetDetail) => {
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

    worksheet = await this.activateWorksheet(worksheet, worksheetDestails, [])

    const vasWorksheet: Worksheet = await this.findWorksheetByRefOrder(releaseGood, WORKSHEET_TYPE.VAS)
    if (vasWorksheet) {
      await this.activateVAS(vasWorksheet.name, vasWorksheet.worksheetDetails)
    }

    const pendingSplitOIs: OrderInventory[] = await this.trxMgr.getRepository(OrderInventory).find({
      where: { domain: this.domain, releaseGood, status: ORDER_INVENTORY_STATUS.PENDING_SPLIT }
    })
    if (pendingSplitOIs?.length) {
      const ids: string[] = pendingSplitOIs.map((oi: OrderInventory) => oi.id)
      await this.trxMgr.getRepository(OrderInventory).delete(ids)
    }

    return worksheet
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
      'worksheetDetails.targetInventory.product',
      'worksheetDetails.targetInventory.inventory'
    ])
    const worksheetDestails: WorksheetDetail[] = worksheet.worksheetDetails.filter(
      (wsd: WorksheetDetail) =>
        wsd.targetInventory.batchId === batchId &&
        wsd.targetInventory.product?.id === productId &&
        wsd.targetInventory.packingType === packingType
    )

    let worksheetDetailIds: string[] = []
    let targetInventoryIds: string[] = []

    for (const worksheetDetail of worksheetDestails) {
      worksheetDetailIds.push(worksheetDetail.id)
      const targetInventory: OrderInventory = worksheetDetail.targetInventory
      targetInventoryIds.push(targetInventory.id)

      let inventory: Inventory = worksheetDetail.targetInventory.inventory
      inventory.lockedQty -= targetInventory.releaseQty
      inventory.lockedWeight -= targetInventory.releaseWeight
      inventory.updater = this.user
      await this.trxMgr.getRepository(Inventory).save(inventory)
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
    targetInventory.updater = this.user
    await this.updateOrderTargets([targetInventory])

    inventory.qty -= targetInventory.releaseQty
    inventory.weight = Math.round((inventory.weight - targetInventory.releaseWeight) * 100) / 100
    inventory.lockedQty = 0
    inventory.lockedWeight = 0
    inventory = this.modifyInventory(
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
      await this.modifyInventory(inventory, releaseGood, 0, 0, INVENTORY_TRANSACTION_TYPE.TERMINATED)
    }

    const fromLocation: Location = targetInventory.inventory.location
    if (locationName) {
      const toLocation: Location = await this.trxMgr.getRepository(
        Location.findRefOrder({
          where: { domain: this.domain, name: locationName },
          relations: ['warehouse']
        })
      )
      if (!toLocation) throw new Error(this.ERROR_MSG.FIND.NO_RESULT(locationName))

      if (fromLocation.id !== toLocation.id) {
        inventory.location = toLocation
        inventory.warehouse = toLocation.warehouse
        inventory.zone = toLocation.zone
        inventory = await this.modifyInventory(inventory, releaseGood, 0, 0, INVENTORY_TRANSACTION_TYPE.RELOCATE)
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
      'worksheetDestails',
      'worksheetDestails.targetInventory'
    ])
    this.checkRecordValidity(worksheet, { status: WORKSHEET_STATUS.EXECUTING })

    return await this.completWorksheet(worksheet, ORDER_STATUS.LOADING)
  }
}
