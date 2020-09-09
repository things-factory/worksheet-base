import { Bizplace } from '@things-factory/biz-base'
import {
  ArrivalNotice,
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

export class PutawayWorksheetController extends VasWorksheetController {
  async generatePutawayWorksheet(arrivalNoticeNo: string, inventories: Inventory[]): Promise<Worksheet> {
    let arrivalNotice: ArrivalNotice = await this.findRefOrder(
      ArrivalNotice,
      {
        domain: this.domain,
        name: arrivalNoticeNo,
        status: ORDER_STATUS.ARRIVED
      },
      ['bizplace']
    )

    const bizplace: Bizplace = arrivalNotice.bizplace
    const unloadingWorksheet: Worksheet = await this.findWorksheetByRefOrder(arrivalNotice, WORKSHEET_TYPE.UNLOADING, [
      'bufferLocation'
    ])
    const bufferLocation: Location = unloadingWorksheet.bufferLocation

    // Check whether putaway worksheet is exists or not
    let worksheet: Worksheet = await this.findWorksheetByRefOrder(arrivalNotice, WORKSHEET_TYPE.PUTAWAY)

    let oiStatus: string = ORDER_PRODUCT_STATUS.UNLOADED // Default status of order inventories is UNLOADED
    let wsdStatus: string = WORKSHEET_STATUS.DEACTIVATED // Default status of worksheet is DEACTIVATED
    if (!worksheet) {
      // If it's not exists create new putaway worksheet
      worksheet = await this.createWorksheet(arrivalNotice, WORKSHEET_TYPE.PUTAWAY, { bufferLocation })
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

      let targetInventory: OrderInventory = {
        domain: this.domain,
        bizplace,
        name: OrderNoGenerator.orderInventory(),
        status: oiStatus,
        type: ORDER_TYPES.ARRIVAL_NOTICE,
        arrivalNotice,
        inventory,
        creator: this.user,
        updater: this.user
      }
      targetInventory = await this.trxMgr.getRepository(OrderInventory).save(targetInventory)
      worksheet.worksheetDetails = await this.createWorksheetDetails(
        worksheet,
        WORKSHEET_TYPE.PUTAWAY,
        [targetInventory],
        { status: wsdStatus }
      )
    }

    return worksheet
  }

  async activatePutaway(worksheetNo: string, putawayWorksheetDetails: Partial<WorksheetDetail>[]): Promise<Worksheet> {
    let worksheet: Worksheet = await this.findActivatableWorksheet(worksheetNo, WORKSHEET_TYPE.PUTAWAY, [
      'arrivalNotice',
      'worksheetDetails',
      'worksheetDetails.targetInventory'
    ])

    let arrivalNotice: ArrivalNotice = worksheet.arrivalNotice
    const nonFinishedVasCnt: number = await this.trxMgr.getRepository(Worksheet).count({
      where: {
        domain: this.domain,
        arrivalNotice,
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

    arrivalNotice.status = ORDER_STATUS.PUTTING_AWAY
    arrivalNotice.updater = this.user
    await this.updateRefOrder(arrivalNotice)
    return this.activateWorksheet(worksheet, worksheetDetails, putawayWorksheetDetails)
  }

  async completePutaway(arrivalNoticeNo: string): Promise<Worksheet> {
    // Because of partial unloading current status of arrivalNotice can be PUTTING_AWAY or PROCESSING
    // PUTTING_AWAY means unloading is completely finished.
    // PROCESSING means some products are still being unloaded.
    let arrivalNotice: ArrivalNotice = await this.findRefOrder(ArrivalNotice, {
      name: arrivalNoticeNo,
      status: In([ORDER_STATUS.PUTTING_AWAY, ORDER_STATUS.PROCESSING])
    })

    // Check whether unloading is done or not.
    const unloadingWorksheetCnt: number = await this.trxMgr.getRepository(Worksheet).count({
      where: {
        domain: this.domain,
        arrivalNotice,
        type: WORKSHEET_TYPE.UNLOADING,
        status: WORKSHEET_STATUS.EXECUTING
      }
    })
    if (unloadingWorksheetCnt) throw new Error(`Unloading is not completed yet`)

    const putawayWorksheet: Worksheet = await this.findWorksheetByRefOrder(arrivalNotice, WORKSHEET_TYPE.PUTAWAY, [
      'bufferLocation'
    ])
    await switchLocationStatus(this.domain, putawayWorksheet.bufferLocation, this.user, this.trxMgr)
    return await this.completWorksheet(putawayWorksheet, ORDER_STATUS.DONE)
  }

  async putaway(worksheetDetailName: string, palletId: string, locationName: string): Promise<void> {
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
      WORKSHEET_TYPE.PUTAWAY,
      [
        'worksheet',
        'worksheet.arrivalNotice',
        'worksheet.worksheetDetails',
        'worksheet.worksheetDetails.targetInventory',
        'worksheet.worksheetDetails.targetInventory.inventory'
      ]
    )

    const worksheet: Worksheet = worksheetDetail.worksheet
    const arrivalNotice: ArrivalNotice = worksheet.arrivalNotice
    const worksheetDetails: WorksheetDetail[] = worksheet.worksheetDetails
    const inventories: Inventory[] = await this.trxMgr.getRepository(Inventory).find({
      where: {
        domain: this.domain,
        reusablePallet,
        refOrderId: arrivalNotice.id,
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
        where: { domain: this.domain, name: locationName, type: In([LOCATION_TYPE.SHELF, LOCATION_TYPE.BUFFER]) },
        relations: ['warehouse']
      })
      if (!location) throw new Error(this.ERROR_MSG.FIND.NO_RESULT(locationName))
      const warehouse: Warehouse = location.warehouse
      const zone: string = location.zone

      inventory.location = location
      inventory.status = INVENTORY_STATUS.STORED
      inventory.warehouse = warehouse
      inventory.zone = zone
      await this.transactionInventory(inventory, arrivalNotice, 0, 0, INVENTORY_TRANSACTION_TYPE.PUTAWAY)

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
      WORKSHEET_TYPE.PUTAWAY,
      ['worksheet', 'worksheet.arrivalNotice', 'targetInventory', 'targetInventory.inventory']
    )

    const worksheet: Worksheet = worksheetDetail.worksheet
    const arrivalNotice: ArrivalNotice = worksheet.arrivalNotice
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
    await this.transactionInventory(inventory, arrivalNotice, 0, 0, INVENTORY_TRANSACTION_TYPE.PUTAWY)

    targetInventory.status = ORDER_INVENTORY_STATUS.TERMINATED
    targetInventory.updater = this.user
    await this.updateOrderTargets([targetInventory])

    worksheetDetail.status = WORKSHEET_STATUS.DONE
    worksheetDetail.updater = this.user
    await this.trxMgr.getRepository(WorksheetDetail).save(worksheetDetail)
  }

  async undoPutaway(worksheetDetailName: string, palletId: string): Promise<void> {
    let worksheetDetail: WorksheetDetail = await this.findWorksheetDetailByName(worksheetDetailName, [
      'worksheet',
      'worksheet.arrivalNotice',
      'targetInventory',
      'targetInventory.inventory'
    ])
    this.checkRecordValidity(worksheetDetail, { status: WORKSHEET_STATUS.DONE })

    const worksheet: Worksheet = worksheetDetail.worksheet
    const arrivalNotice: ArrivalNotice = worksheet.arrivalNotice
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
    await this.transactionInventory(inventory, arrivalNotice, 0, 0, INVENTORY_TRANSACTION_TYPE.UNDO_PUTAWAY)

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
