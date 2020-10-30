import { Bizplace } from '@things-factory/biz-base'
import { Product } from '@things-factory/product-base'
import {
  ArrivalNotice,
  ReleaseGood,
  OrderNoGenerator,
  OrderInventory,
  OrderProduct,
  OrderVas,
  ORDER_INVENTORY_STATUS,
  ORDER_PRODUCT_STATUS,
  ORDER_STATUS,
  ORDER_TYPES,
  ORDER_VAS_STATUS,
  ReturnOrder,
  Vas,
  VAS_TARGET_TYPES
} from '@things-factory/sales-base'
import {
  Inventory,
  InventoryNoGenerator,
  INVENTORY_STATUS,
  INVENTORY_TRANSACTION_TYPE,
  Location,
  Pallet,
  Warehouse
} from '@things-factory/warehouse-base'
import { Equal, In, Not } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../constants'
import { Worksheet, WorksheetDetail } from '../../entities'
import { VasWorksheetController } from '../vas/vas-worksheet-controller'
import { PutawayWorksheetController } from '../inbound/putaway-worksheet-controller'

export type OutboundReturningWorksheetDetail = Partial<WorksheetDetail> & {
  palletizingVasId: string
  palletQty: number
  palletizingDescription: string
}

export class OutboundReturningWorksheetController extends VasWorksheetController {
  async generateOutboundReturningWorksheet(returnOrderNo: string, bufferLocationId: string): Promise<Worksheet> {
    let returnOrder: ReturnOrder = await this.findRefOrder(
      ReturnOrder,
      {
        domain: this.domain,
        name: returnOrderNo,
        status: ORDER_STATUS.ARRIVED
      },
      ['bizplace', 'orderInventories', 'orderVass']
    )
    const orderInventories: OrderInventory[] = returnOrder.orderInventories
    const orderVASs: OrderVas[] = returnOrder.orderVass
    const bufferLocation: Location = await this.trxMgr.getRepository(Location).findOne(bufferLocationId)

    const worksheet: Worksheet = await this.generateWorksheet(
      WORKSHEET_TYPE.OUTBOUND_RETURN,
      returnOrder,
      orderInventories,
      ORDER_STATUS.READY_TO_UNLOAD,
      ORDER_PRODUCT_STATUS.READY_TO_UNLOAD,
      { bufferLocation }
    )

    if (orderVASs?.length > 0) {
      await this.generateVasWorksheet(returnOrder)
    }

    return worksheet
  }

  async activateOutboundReturn(
    worksheetNo: string,
    outboundReturnWorksheetDetails: OutboundReturningWorksheetDetail[]
  ): Promise<Worksheet> {
    let worksheet: Worksheet = await this.findActivatableWorksheet(worksheetNo, WORKSHEET_TYPE.OUTBOUND_RETURN, [
      'bizplace',
      'returnOrder',
      'worksheetDetails',
      'worksheetDetails.targetInventory',
      'worksheetDetails.targetInventory.product'
    ])

    const bizplace: Bizplace = worksheet.bizplace
    let worksheetDetails: WorksheetDetail[] = worksheet.worksheetDetails

    const targetInventories: OrderInventory[] = worksheetDetails.map((wsd: WorksheetDetail) => {
      let targetInventory: OrderInventory = wsd.targetInventory
      targetInventory.status = ORDER_PRODUCT_STATUS.UNLOADING
      targetInventory.updater = this.user
      return targetInventory
    })
    await this.updateOrderTargets(targetInventories)

    let returnOrder: ReturnOrder = worksheet.returnOrder
    returnOrder.status = ORDER_STATUS.PROCESSING
    returnOrder.updater = this.user
    this.updateRefOrder(returnOrder)

    worksheet = await this.activateWorksheet(worksheet, worksheetDetails, outboundReturnWorksheetDetails)

    try {
      const vasWorksheet: Worksheet = await this.findWorksheetByRefOrder(returnOrder, WORKSHEET_TYPE.VAS)
      if (vasWorksheet) {
        await this.activateVAS(vasWorksheet.name, vasWorksheet.worksheetDetails)
      }
    } catch (e) {
      // Do nothing
    }

    return worksheet
  }

  async completeUnloading(
    arrivalNoticeNo: string,
    OutboundReturningWorksheetDetails: Partial<WorksheetDetail>[]
  ): Promise<void> {
    let arrivalNotice: ArrivalNotice = await this.findRefOrder(
      ArrivalNotice,
      { domain: this.domain, name: arrivalNoticeNo, status: In([ORDER_STATUS.PROCESSING, ORDER_STATUS.PUTTING_AWAY]) },
      ['orderProducts', 'releaseGood']
    )

    if (arrivalNotice.crossDocking) {
      // Picking worksheet for cross docking should be completed before complete it
      // Find picking worksheet
      const releaseGood: ReleaseGood = arrivalNotice.releaseGood
      const executingPickingWS: Worksheet = await this.trxMgr.getRepository(Worksheet).findOne({
        where: {
          domain: this.domain,
          releaseGood,
          type: WORKSHEET_TYPE.PICKING,
          status: Not(Equal(WORKSHEET_STATUS.DONE))
        }
      })

      if (executingPickingWS)
        throw new Error(`Picking should be completed before complete unloading for cross docking.`)
    }

    if (arrivalNotice.orderProducts.some((op: OrderProduct) => op.status === ORDER_PRODUCT_STATUS.READY_TO_APPROVED)) {
      throw new Error(`There's non-approved order products`)
    }

    let worksheet: Worksheet = await this.findWorksheetByRefOrder(arrivalNotice, WORKSHEET_TYPE.UNLOADING, [
      'worksheetDetails',
      'worksheetDetails.targetProduct'
    ])
    this.checkRecordValidity(worksheet, { status: WORKSHEET_STATUS.EXECUTING })

    const partiallyUnloadedCnt: number = await this.trxMgr.getRepository(Inventory).count({
      where: { domain: this.domain, refOrderId: arrivalNotice.id, status: INVENTORY_STATUS.PARTIALLY_UNLOADED }
    })
    if (partiallyUnloadedCnt) {
      throw new Error('There is partially unloaded pallet, generate putaway worksheet before complete unloading.')
    }

    if (OutboundReturningWorksheetDetails.some((wsd: Partial<WorksheetDetail>) => wsd.issue)) {
      const worksheetDetails: WorksheetDetail[] = worksheet.worksheetDetails
      OutboundReturningWorksheetDetails = this.renewWorksheetDetails(
        worksheetDetails,
        OutboundReturningWorksheetDetails,
        'name',
        {
          updater: this.user
        }
      )
      const worksheetDetailsWithIssue: WorksheetDetail[] = OutboundReturningWorksheetDetails.filter(
        (wsd: WorksheetDetail) => wsd.issue
      ) as WorksheetDetail[]
      if (worksheetDetailsWithIssue.length) {
        await this.trxMgr.getRepository(WorksheetDetail).save(worksheetDetailsWithIssue)
      }

      const targetProductsWithIssue: OrderProduct[] = worksheetDetailsWithIssue.map((wsd: WorksheetDetail) => {
        let targetProduct: OrderProduct = wsd.targetProduct
        targetProduct.remark = wsd.issue
        return targetProduct
      })
      await this.updateOrderTargets(targetProductsWithIssue)
    }

    if (arrivalNotice.status !== ORDER_STATUS.PUTTING_AWAY) {
      await this.completWorksheet(worksheet, ORDER_STATUS.READY_TO_PUTAWAY)
    } else {
      await this.completWorksheet(worksheet)
    }
  }

  async completeUnloadingPartially(
    arrivalNoticeNo: string,
    OutboundReturningWorksheetDetail: Partial<WorksheetDetail>
  ): Promise<Worksheet> {
    const arrivalNotice: ArrivalNotice = await this.findRefOrder(ArrivalNotice, {
      name: arrivalNoticeNo,
      status: ORDER_STATUS.PROCESSING
    })

    const worksheet: Worksheet = await this.findWorksheetByRefOrder(arrivalNotice, WORKSHEET_TYPE.UNLOADING, [
      'worksheetDetails',
      'worksheetDetails.targetProduct'
    ])
    this.checkRecordValidity(worksheet, { status: WORKSHEET_STATUS.EXECUTING })

    let worksheetDetail: WorksheetDetail = worksheet.worksheetDetails.find(
      (wsd: WorksheetDetail) => wsd.name === OutboundReturningWorksheetDetail.name
    )
    worksheetDetail.status = WORKSHEET_STATUS.PARTIALLY_UNLOADED
    worksheetDetail.issue = OutboundReturningWorksheetDetail.issue || worksheetDetail.issue
    worksheetDetail.updater = this.user
    worksheetDetail = await this.trxMgr.getRepository(WorksheetDetail).save(worksheetDetail)

    let targetProduct: OrderProduct = worksheetDetail.targetProduct
    targetProduct.status = ORDER_PRODUCT_STATUS.PARTIALLY_UNLOADED
    targetProduct.remark = worksheetDetail.issue || targetProduct.remark
    await this.updateOrderTargets([targetProduct])

    let inventories: Inventory[] = await this.trxMgr.getRepository(Inventory).find({
      where: {
        domain: this.domain,
        refOrderId: arrivalNotice.id,
        orderProductId: targetProduct.id,
        status: INVENTORY_STATUS.UNLOADED
      }
    })

    inventories.forEach((inventory: Inventory) => {
      inventory.status = INVENTORY_STATUS.PARTIALLY_UNLOADED
      inventory.updater = this.user
    })
    await this.trxMgr.getRepository(Inventory).save(inventories)

    return worksheet
  }

  async completePreunloading(arrivalNoticeNo: string): Promise<Worksheet> {
    const arrivalNotice: ArrivalNotice = await this.findRefOrder(
      ArrivalNotice,
      { domain: this.domain, name: arrivalNoticeNo, status: ORDER_STATUS.READY_TO_UNLOAD },
      ['orderProducts']
    )
    const orderProducts: OrderProduct[] = arrivalNotice.orderProducts
    let unloadableOrderProducts: OrderProduct[] = orderProducts
      .filter((orderProduct: OrderProduct) => orderProduct.status === ORDER_PRODUCT_STATUS.INSPECTED)
      .map((orderProduct: OrderProduct) => {
        orderProduct.palletQty = orderProduct.adjustedPalletQty
        orderProduct.status = ORDER_PRODUCT_STATUS.READY_TO_UNLOAD
        orderProduct.updater = this.user
        return orderProduct
      })
    if (unloadableOrderProducts.length > 0) await this.updateOrderTargets(unloadableOrderProducts)

    let nonUnloadableOrderProducts: OrderProduct[] = orderProducts
      .filter((orderProduct: OrderProduct) => orderProduct.status === ORDER_PRODUCT_STATUS.PENDING_APPROVAL)
      .map((orderProduct: OrderProduct) => {
        orderProduct.palletQty = orderProduct.adjustedPalletQty
        orderProduct.updater = this.user
        return orderProduct
      })
    if (nonUnloadableOrderProducts.length > 0) await this.updateOrderTargets(nonUnloadableOrderProducts)

    let unloadingWorksheet: Worksheet = await this.findWorksheetByRefOrder(arrivalNotice, WORKSHEET_TYPE.UNLOADING, [
      'worksheetDetails',
      'worksheetDetails.targetInventory',
      'worksheetDetails.targetInventory.inventory'
    ])
    if (nonUnloadableOrderProducts.length > 0) {
      unloadingWorksheet.status = WORKSHEET_STATUS.PENDING_ADJUSTMENT
    } else {
      unloadingWorksheet.status = WORKSHEET_STATUS.DEACTIVATED

      let worksheetDetails: WorksheetDetail[] = unloadingWorksheet.worksheetDetails
      worksheetDetails.forEach((worksheetDetail: WorksheetDetail) => {
        worksheetDetail.status = WORKSHEET_STATUS.DEACTIVATED
        worksheetDetail.updater = this.user
      })
      await this.trxMgr.getRepository(WorksheetDetail).save(worksheetDetails)
    }

    unloadingWorksheet.updater = this.user
    return await this.trxMgr.getRepository(Worksheet).save(unloadingWorksheet)
  }

  async createPalletizingWSDs(
    bizplace: Bizplace,
    arrivalNotice: ArrivalNotice,
    worksheetDetails: WorksheetDetail[],
    palletizingWSDs: OutboundReturningWorksheetDetail[]
  ): Promise<void> {
    let palletizingOrderVASs: Partial<OrderVas>[] = []

    for (let palletizingWSD of palletizingWSDs) {
      const palletizingVAS: Vas = await this.trxMgr.getRepository(Vas).findOne({
        where: { domain: this.domain, id: palletizingWSD.palletizingVasId }
      })

      const targetProduct: OrderProduct = worksheetDetails.find(
        (wsd: WorksheetDetail) => wsd.name === palletizingWSD.name
      )

      palletizingOrderVASs.push({
        domain: this.domain,
        bizplace,
        name: OrderNoGenerator.orderVas(),
        arrivalNotice,
        vas: palletizingVAS,
        targetType: VAS_TARGET_TYPES.BATCH_AND_PRODUCT_TYPE,
        targetBatchId: targetProduct.batchId,
        targetProduct: targetProduct.product,
        packingType: targetProduct.packingType,
        description: palletizingWSD.palletizingDescription,
        type: ORDER_TYPES.ARRIVAL_NOTICE,
        status: ORDER_VAS_STATUS.COMPLETED,
        creator: this.user,
        updater: this.user
      })
    }

    this.trxMgr.getRepository(OrderVas).save(palletizingOrderVASs)

    let vasWorksheet: Worksheet = await this.findWorksheetByRefOrder(arrivalNotice, WORKSHEET_TYPE.VAS)
    if (!vasWorksheet) {
      this.generateVasWorksheet(arrivalNotice)
    } else {
      await this.createWorksheetDetails(vasWorksheet, WORKSHEET_TYPE.VAS, palletizingOrderVASs)
    }
  }

  filterPalletizingWSDs(unloadingWSDs: OutboundReturningWorksheetDetail[]): OutboundReturningWorksheetDetail[] {
    return unloadingWSDs.filter((wsd: OutboundReturningWorksheetDetail) => wsd.palletQty && wsd.palletizingDescription)
  }
}
