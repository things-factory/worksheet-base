import { Bizplace } from '@things-factory/biz-base'
import {
    ArrivalNotice,
  ReturnOrder,
  OrderInventory,
  OrderNoGenerator,
  ORDER_INVENTORY_STATUS,
  ORDER_PRODUCT_STATUS,
  ORDER_STATUS,
  ORDER_TYPES
} from '@things-factory/sales-base'
import {
  Inventory,
  INVENTORY_STATUS,
  INVENTORY_TRANSACTION_TYPE,
  Location,
  LOCATION_TYPE,
  Pallet,
  Warehouse
} from '@things-factory/warehouse-base'
import { Equal, In, Not } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../constants'
import { Worksheet, WorksheetDetail } from '../../entities'
import { switchLocationStatus } from '../../utils'
import { VasWorksheetController } from '../vas/vas-worksheet-controller'

export class PutawayReturningWorksheetController extends VasWorksheetController {
  async generatePutawayReturnWorksheet(returnOrderNo: string, inventories: Inventory[]): Promise<Worksheet> {
    let returnOrder: ReturnOrder = await this.findRefOrder(
        ReturnOrder,
      { domain: this.domain, name: returnOrderNo },
      ['bizplace']
    )

    const bizplace: Bizplace = returnOrder.bizplace
    const unloadingWorksheet: Worksheet = await this.findWorksheetByRefOrder(returnOrder, WORKSHEET_TYPE.UNLOADING_RETURN, [
      'bufferLocation'
    ])
    const bufferLocation: Location = unloadingWorksheet.bufferLocation

    // Check whether putaway worksheet is exists or not
    let worksheet: Worksheet
    try {
      worksheet = await this.findWorksheetByRefOrder(returnOrder, WORKSHEET_TYPE.PUTAWAY_RETURN)
    } catch (e) {}

    let oiStatus: string = ORDER_PRODUCT_STATUS.UNLOADED // Default status of order inventories is UNLOADED
    let wsdStatus: string = WORKSHEET_STATUS.DEACTIVATED // Default status of worksheet is DEACTIVATED
    if (!worksheet) {
      // If it's not exists create new putaway worksheet
      worksheet = await this.createWorksheet(returnOrder, WORKSHEET_TYPE.PUTAWAY_RETURN, { bufferLocation })
    } else {
      // If there is putaway worksheet. It means unloading is completed partially.
      // So status of newly created worksheet details and order inventories should be changed to
      // Executing situation.
      oiStatus = ORDER_PRODUCT_STATUS.PUTTING_AWAY // Default status = PUTTING_AWAY
      wsdStatus = WORKSHEET_STATUS.EXECUTING // Default status = EXECUTING
    }

    if (inventories.some((inv: Inventory) => !(inv instanceof Inventory))) {
      inventories = await this.trxMgr.getRepository(Inventory).findByIds(inventories.map((inv: Inventory) => inv.id))
    }

    for (let inventory of inventories) {
      inventory.status = INVENTORY_STATUS.PUTTING_AWAY
      inventory.updater = this.user
      inventory = await this.trxMgr.getRepository(Inventory).save(inventory)

      let targetInventory: OrderInventory = new OrderInventory()
      targetInventory.domain = this.domain
      targetInventory.bizplace = bizplace
      targetInventory.name = OrderNoGenerator.orderInventory()
      targetInventory.status = oiStatus
      targetInventory.type = ORDER_TYPES.RETURN_ORDER
      targetInventory.returnOrder = returnOrder
      targetInventory.inventory = inventory
      targetInventory.creator = this.user
      targetInventory.updater = this.user
      targetInventory = await this.trxMgr.getRepository(OrderInventory).save(targetInventory)

      worksheet.worksheetDetails = await this.createWorksheetDetails(
        worksheet,
        WORKSHEET_TYPE.PUTAWAY_RETURN,
        [targetInventory],
        { status: wsdStatus, fromLocation: bufferLocation }
      )
    }

    return worksheet
  }

  async activatePutawayReturning(worksheetNo: string, putawayWorksheetDetails: Partial<WorksheetDetail>[]): Promise<Worksheet> {
    let worksheet: Worksheet = await this.findActivatableWorksheet(worksheetNo, WORKSHEET_TYPE.PUTAWAY_RETURN, [
      'returnOrder',
      'worksheetDetails',
      'worksheetDetails.targetInventory'
    ])

    let returnOrder: ReturnOrder = worksheet.returnOrder
    const nonFinishedVasCnt: number = await this.trxMgr.getRepository(Worksheet).count({
      where: {
        domain: this.domain,
        returnOrder,
        type: WORKSHEET_TYPE.VAS,
        status: Not(Equal(WORKSHEET_STATUS.DONE))
      }
    })
    if (nonFinishedVasCnt) return

    const worksheetDetails: WorksheetDetail[] = worksheet.worksheetDetails
    const targetInventories: OrderInventory[] = worksheetDetails.map((wsd: WorksheetDetail) => {
      let targetInventory: OrderInventory = wsd.targetInventory
      targetInventory.status = ORDER_PRODUCT_STATUS.PUTTING_AWAY
      targetInventory.updater = this.user
      return targetInventory
    })
    await this.updateOrderTargets(targetInventories)

    returnOrder.status = ORDER_STATUS.PUTTING_AWAY
    returnOrder.updater = this.user
    await this.updateRefOrder(returnOrder)
    return this.activateWorksheet(worksheet, worksheetDetails, putawayWorksheetDetails)
  }

  async completePutawayReturn(returnOrderNo: string): Promise<Worksheet> {
    // Because of partial unloading current status of arrivalNotice can be PUTTING_AWAY or PROCESSING
    // PUTTING_AWAY means unloading is completely finished.
    // PROCESSING means some products are still being unloaded.
    let returnOrder: ReturnOrder = await this.findRefOrder(ReturnOrder, {
      name: returnOrderNo,
      status: In([ORDER_STATUS.PUTTING_AWAY, ORDER_STATUS.PROCESSING])
    })

    // Check whether unloading is done or not.
    const unloadingWorksheetCnt: number = await this.trxMgr.getRepository(Worksheet).count({
      where: {
        domain: this.domain,
        returnOrder,
        type: WORKSHEET_TYPE.UNLOADING_RETURN,
        status: WORKSHEET_STATUS.EXECUTING
      }
    })
    if (unloadingWorksheetCnt) throw new Error(`Unloading is not completed yet`)

    const putawayWorksheet: Worksheet = await this.findWorksheetByRefOrder(returnOrder, WORKSHEET_TYPE.PUTAWAY_RETURN, [
      'bufferLocation'
    ])
    await switchLocationStatus(this.domain, putawayWorksheet.bufferLocation, this.user, this.trxMgr)
    return await this.completeWorksheet(putawayWorksheet, ORDER_STATUS.DONE)
  }

  async putawayReturn(worksheetDetailName: string, palletId: string, locationName: string): Promise<void> {
    const reusablePallet: Pallet = await this.trxMgr.getRepository(Pallet).findOne({
      where: { domain: this.domain, name: palletId }
    })

    if (reusablePallet) {
      await this.putawayPallets(worksheetDetailName, reusablePallet, locationName)
    } else {
      await this.putawayPallet(worksheetDetailName, palletId, locationName)
    }
  }

  async putawayPallets(worksheetDetailName: string, reusablePallet: Pallet, locationName: string): Promise<void> {
    const worksheetDetail: WorksheetDetail = await this.findExecutableWorksheetDetailByName(
      worksheetDetailName,
      WORKSHEET_TYPE.PUTAWAY_RETURN,
      [
        'worksheet',
        'worksheet.returnOrder',
        'worksheet.worksheetDetails',
        'worksheet.worksheetDetails.targetInventory',
        'worksheet.worksheetDetails.targetInventory.inventory'
      ]
    )

    const worksheet: Worksheet = worksheetDetail.worksheet
    const returnOrder: ReturnOrder = worksheet.returnOrder
    const worksheetDetails: WorksheetDetail[] = worksheet.worksheetDetails
    const inventories: Inventory[] = await this.trxMgr.getRepository(Inventory).find({
      where: {
        domain: this.domain,
        reusablePallet,
        refOrderId: returnOrder.id,
        status: In([INVENTORY_STATUS.PUTTING_AWAY, INVENTORY_STATUS.UNLOADED])
      }
    })

    for (let inventory of inventories) {
      const worksheetDetail: WorksheetDetail = worksheetDetails.find(
        (wsd: WorksheetDetail) => wsd.targetInventory.inventory.name === inventory.name
      )

      let targetInventory: OrderInventory = worksheetDetail.targetInventory
      inventory = targetInventory.inventory

      let location: Location = await this.trxMgr.getRepository(Location).findOne({
        where: {
          domain: this.domain,
          name: locationName,
          type: In([LOCATION_TYPE.SHELF, LOCATION_TYPE.BUFFER, LOCATION_TYPE.FLOOR])
        },
        relations: ['warehouse']
      })
      if (!location) throw new Error(this.ERROR_MSG.FIND.NO_RESULT(locationName))
      const warehouse: Warehouse = location.warehouse
      const zone: string = location.zone

      inventory.location = location
      inventory.status = INVENTORY_STATUS.STORED
      inventory.warehouse = warehouse
      inventory.zone = zone
      await this.transactionInventory(inventory, returnOrder, 0, 0, INVENTORY_TRANSACTION_TYPE.PUTAWAY)

      targetInventory.status = ORDER_INVENTORY_STATUS.TERMINATED
      targetInventory.updater = this.user
      await this.updateOrderTargets([targetInventory])

      worksheetDetail.status = WORKSHEET_STATUS.DONE
      worksheetDetail.updater = this.user
      await this.trxMgr.getRepository(WorksheetDetail).save(worksheetDetail)
    }
  }

  async putawayPallet(worksheetDetailName: string, palletId: string, locationName: string): Promise<void> {
    const worksheetDetail: WorksheetDetail = await this.findExecutableWorksheetDetailByName(
      worksheetDetailName,
      WORKSHEET_TYPE.PUTAWAY_RETURN,
      ['worksheet', 'worksheet.returnOrder', 'targetInventory', 'targetInventory.inventory']
    )

    const worksheet: Worksheet = worksheetDetail.worksheet
    const returnOrder: ReturnOrder = worksheet.returnOrder
    let targetInventory: OrderInventory = worksheetDetail.targetInventory
    let inventory: Inventory = targetInventory.inventory

    if (inventory.palletId !== palletId) {
      throw new Error(this.ERROR_MSG.VALIDITY.UNEXPECTED_FIELD_VALUE('palletId', palletId, inventory.palletId))
    }

    const location: Location = await this.trxMgr.getRepository(Location).findOne({
      where: { domain: this.domain, name: locationName, type: In([LOCATION_TYPE.SHELF, LOCATION_TYPE.BUFFER]) },
      relations: ['warehouse']
    })
    if (!location) throw new Error(this.ERROR_MSG.FIND.NO_RESULT(locationName))
    const warehouse: Warehouse = location.warehouse
    const zone: string = warehouse.zone

    inventory.location = location
    inventory.status = INVENTORY_STATUS.STORED
    inventory.warehouse = warehouse
    inventory.zone = zone
    await this.transactionInventory(inventory, returnOrder, 0, 0, INVENTORY_TRANSACTION_TYPE.PUTAWAY)

    targetInventory.status = ORDER_INVENTORY_STATUS.TERMINATED
    targetInventory.updater = this.user
    await this.updateOrderTargets([targetInventory])

    worksheetDetail.status = WORKSHEET_STATUS.DONE
    worksheetDetail.updater = this.user
    await this.trxMgr.getRepository(WorksheetDetail).save(worksheetDetail)
  }

  async undoPutawayReturn(worksheetDetailName: string, palletId: string): Promise<void> {
    let worksheetDetail: WorksheetDetail = await this.findWorksheetDetailByName(worksheetDetailName, [
      'worksheet',
      'worksheet.returnOrder',
      'targetInventory',
      'targetInventory.inventory',
      'fromLocation'
    ])
    this.checkRecordValidity(worksheetDetail, { status: WORKSHEET_STATUS.DONE })

    const worksheet: Worksheet = worksheetDetail.worksheet
    const returnOrder: ReturnOrder = worksheet.returnOrder
    const targetInventory: OrderInventory = worksheetDetail.targetInventory
    let inventory: Inventory = await this.trxMgr.getRepository(Inventory).findOne({
      where: { domain: this.domain, palletId }
    })
    await this.checkReleaseTarget(inventory)

    const bufferLocation: Location = await this.trxMgr.getRepository(Location).findOne({
      where: { domain: this.domain, name: worksheetDetail.fromLocation.name }
    })
    inventory.location = bufferLocation
    inventory.status = INVENTORY_STATUS.UNLOADED
    await this.transactionInventory(inventory, returnOrder, 0, 0, INVENTORY_TRANSACTION_TYPE.UNDO_PUTAWAY)

    targetInventory.status = ORDER_PRODUCT_STATUS.PUTTING_AWAY
    targetInventory.updater = this.user
    await this.updateOrderTargets([targetInventory])

    worksheetDetail.status = WORKSHEET_STATUS.EXECUTING
    worksheetDetail.updater = this.user
    await this.trxMgr.getRepository(WorksheetDetail).save(worksheetDetail)
  }

  private async checkReleaseTarget(inventory: Inventory): Promise<void> {
    const releaseTargetInventory: OrderInventory = await this.trxMgr.getRepository(OrderInventory).findOne({
      where: {
        domain: this.domain,
        type: ORDER_TYPES.RELEASE_OF_GOODS,
        inventory
      }
    })

    if (releaseTargetInventory)
      throw new Error(
        this.ERROR_MSG.VALIDITY.CANT_PROCEED_STEP_BY('undo putaway', 'this pallet ID has been selected for releasing')
      )
  }
}
