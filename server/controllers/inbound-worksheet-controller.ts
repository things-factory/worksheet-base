import { User } from '@things-factory/auth-base'
import { Bizplace } from '@things-factory/biz-base'
import {
  ArrivalNotice,
  OrderInventory,
  OrderNoGenerator,
  OrderProduct,
  OrderVas,
  ORDER_PRODUCT_STATUS,
  ORDER_STATUS,
  ORDER_TYPES
} from '@things-factory/sales-base'
import { Domain } from '@things-factory/shell'
import { Inventory, INVENTORY_STATUS, Location } from '@things-factory/warehouse-base'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../constants'
import { Worksheet, WorksheetDetail } from '../entities'
import { WorksheetNoGenerator } from '../utils'
import { GenerateVasInterface, VasWorksheetController } from './vas-worksheet-controller'
import { GenerateInterface } from './worksheet-controller'

export interface GenerateUnloadingInterface extends GenerateInterface {
  arrivalNoticeNo: string
  bufferLocationId: string
}

export interface GeneratePutawayInterface extends GenerateInterface {
  arrivalNoticeNo: string
  inventories: Inventory[]
}

export class InboundWorksheetController extends VasWorksheetController {
  /**
   * @summary Generate Unloading Worksheet
   * @description
   * Create unloading worksheet
   *  - status: DEACTIVATED
   *
   * Create unloading worksheet details
   *  - status: DEACTIVATED
   *
   * Update status of orderProducts
   *  - status: ARRIVED => READY_TO_UNLOAD
   *
   * Call generateVasWorksheet function if it's needed
   *
   * Update status of arrival notice
   *  - status: ARRIVED => READY_TO_UNLOAD
   * @param {GenerateUnloadingInterface} worksheetInterface
   * @returns {Promise<Worksheet>}
   */
  async generateUnloadingWorksheet(worksheetInterface: GenerateUnloadingInterface): Promise<Worksheet> {
    const domain: Domain = worksheetInterface.domain
    const user: User = worksheetInterface.user
    let arrivalNotice: ArrivalNotice = await this.findRefOrder(
      ArrivalNotice,
      {
        domain,
        name: worksheetInterface.arrivalNoticeNo,
        status: ORDER_STATUS.ARRIVED
      },
      ['bizplace', 'orderProducts', 'orderVass']
    )
    const bizplace: Bizplace = arrivalNotice.bizplace
    const orderProducts: OrderProduct[] = arrivalNotice.orderProducts
    const orderVASs: OrderVas[] = arrivalNotice.orderVass

    const bufferLocationId: string = worksheetInterface.bufferLocationId
    const bufferLocation: Location = await this.trxMgr.getRepository(Location).findOne(bufferLocationId)

    const worksheet: Worksheet = await this.createWorksheet(
      domain,
      bizplace,
      arrivalNotice,
      WORKSHEET_TYPE.UNLOADING,
      user,
      bufferLocation
    )

    const worksheetDetails: Partial<WorksheetDetail>[] = orderProducts.map((targetProduct: OrderProduct) => {
      return {
        domain,
        bizplace,
        worksheet,
        name: WorksheetNoGenerator.unloadingDetail(),
        type: WORKSHEET_TYPE.UNLOADING,
        targetProduct,
        status: WORKSHEET_STATUS.DEACTIVATED,
        creator: user,
        updater: user
      } as Partial<WorksheetDetail>
    })
    await this.createWorksheetDetails(worksheetDetails)

    orderProducts.forEach((ordProd: OrderProduct) => {
      ordProd.status = ORDER_PRODUCT_STATUS.READY_TO_UNLOAD
      ordProd.updater = user
    })
    await this.updateOrderTargets(OrderProduct, orderProducts)

    if (orderVASs?.length > 0) {
      await this.generateVasWorksheet({
        domain,
        user,
        referenceOrder: arrivalNotice
      } as GenerateVasInterface)
    }

    arrivalNotice.status = ORDER_STATUS.READY_TO_UNLOAD
    arrivalNotice.updater = user
    await this.updateRefOrder(ArrivalNotice, arrivalNotice)

    return worksheet
  }

  async generatePutawayWorksheet(worksheetInterface: GeneratePutawayInterface): Promise<Worksheet> {
    const domain: Domain = worksheetInterface.domain
    const user: User = worksheetInterface.user
    let arrivalNotice: ArrivalNotice = await this.findRefOrder(
      ArrivalNotice,
      {
        domain,
        name: worksheetInterface.arrivalNoticeNo,
        status: ORDER_STATUS.ARRIVED
      },
      ['bizplace']
    )

    const bizplace: Bizplace = arrivalNotice.bizplace
    const unloadingWorksheet: Worksheet = await this.findWorksheet(domain, arrivalNotice, WORKSHEET_TYPE.UNLOADING, [
      'bufferLocation'
    ])
    const bufferLocation: Location = unloadingWorksheet.bufferLocation

    // Check whether putaway worksheet is exists or not
    let putawayWorksheet: Worksheet = await this.trxMgr.getRepository(Worksheet).findOne({
      domain,
      bizplace,
      arrivalNotice,
      type: WORKSHEET_TYPE.PUTAWAY
    })

    let wsdStatus: string = WORKSHEET_STATUS.DEACTIVATED // Default status of worksheet is DEACTIVATED
    let oiStatus: string = ORDER_PRODUCT_STATUS.UNLOADED // Default status of order inventories is UNLOADED
    if (!putawayWorksheet) {
      // If it's not exists create new putaway worksheet
      putawayWorksheet = await this.createWorksheet(
        domain,
        bizplace,
        arrivalNotice,
        WORKSHEET_TYPE.PUTAWAY,
        user,
        bufferLocation
      )
    } else {
      // If there is putaway worksheet. It means unloading is completed partially.
      // So status of newly created worksheet details and order inventories should be changed to
      // Executing situation.
      wsdStatus = WORKSHEET_STATUS.EXECUTING // Default status = EXECUTING
      oiStatus = ORDER_PRODUCT_STATUS.PUTTING_AWAY // Default status = PUTTING_AWAY
    }

    let inventories: Inventory[] = worksheetInterface.inventories
    if (inventories.some((inv: Inventory) => !(inv instanceof Inventory))) {
      inventories = await this.trxMgr.getRepository(Inventory).findByIds(inventories.map((inv: Inventory) => inv.id))
    }

    for (let inventory of inventories) {
      inventory.status = INVENTORY_STATUS.PUTTING_AWAY
      inventory.updater = user
      inventory = await this.trxMgr.getRepository(Inventory).save(inventory)

      let targetInventory: OrderInventory = {
        domain,
        bizplace,
        name: OrderNoGenerator.orderInventory(),
        status: oiStatus,
        type: ORDER_TYPES.ARRIVAL_NOTICE,
        arrivalNotice,
        inventory,
        creator: user,
        updater: user
      }
      targetInventory = await this.trxMgr.getRepository(OrderInventory).save(targetInventory)

      const worksheetDetail: Partial<WorksheetDetail> = {
        domain,
        bizplace,
        name: WorksheetNoGenerator.generate(WORKSHEET_TYPE.PUTAWAY, true),
        worksheet: putawayWorksheet,
        targetInventory,
        fromLocation: bufferLocation,
        status: wsdStatus,
        creator: user,
        updater: user
      }
      await this.createWorksheetDetails([worksheetDetail])
    }

    return putawayWorksheet
  }
}
