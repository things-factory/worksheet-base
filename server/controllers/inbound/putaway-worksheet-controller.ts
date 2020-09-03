import { Bizplace } from '@things-factory/biz-base'
import {
  ArrivalNotice,
  OrderInventory,
  OrderNoGenerator,
  ORDER_PRODUCT_STATUS,
  ORDER_STATUS,
  ORDER_TYPES
} from '@things-factory/sales-base'
import { Inventory, INVENTORY_STATUS, Location } from '@things-factory/warehouse-base'
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
      worksheet = await this.createWorksheet(bizplace, arrivalNotice, WORKSHEET_TYPE.PUTAWAY, { bufferLocation })
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
}
