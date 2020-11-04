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
import { PutawayWorksheetController } from './putaway-worksheet-controller'

export type UnloadingReturningWorksheetDetail = Partial<WorksheetDetail> & {
  palletizingVasId: string
  palletQty: number
  palletizingDescription: string
}

export class UnloadingReturningWorksheetController extends VasWorksheetController {
  async generateUnloadingReturnWorksheet(returnOrderNo: string, bufferLocationId: string): Promise<Worksheet> {
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
      WORKSHEET_TYPE.UNLOADING_RETURN,
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

  async activateUnloadingReturn(
    worksheetNo: string,
    unloadingReturnWorksheetDetails: UnloadingReturningWorksheetDetail[]
  ): Promise<Worksheet> {
    let worksheet: Worksheet = await this.findActivatableWorksheet(worksheetNo, WORKSHEET_TYPE.UNLOADING_RETURN, [
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

    worksheet = await this.activateWorksheet(worksheet, worksheetDetails, unloadingReturnWorksheetDetails)

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

  async unloadReturning(worksheetDetailName: string, inventory: Partial<Inventory>): Promise<void> {
    const palletId: string = inventory.palletId
    this.checkPalletDuplication(palletId)

    const worksheetDetail: WorksheetDetail = await this.findExecutableWorksheetDetailByName(
      worksheetDetailName,
      WORKSHEET_TYPE.UNLOADING_RETURN,
      [
        'bizplace',
        'worksheet',
        'worksheet.returnOrder',
        'worksheet.bufferLocation',
        'worksheet.bufferLocation.warehouse',
        'targetInventory',
        'targetInventory.product',
        'targetInventory.inventory'
      ]
    )

    const bizplace: Bizplace = worksheetDetail.bizplace
    const worksheet: Worksheet = worksheetDetail.worksheet
    const returnOrder: ReturnOrder = worksheet.returnOrder
    const targetInventory: OrderInventory = worksheetDetail.targetInventory
    const batchId: string = targetInventory.batchId
    const product: Product = targetInventory.product
    const packingType: string = targetInventory.packingType
    const qty: number = targetInventory.returnQty
    const weight: number = Math.round(targetInventory.returnWeight)
    const location: Location = worksheet.bufferLocation
    const warehouse: Warehouse = location.warehouse
    const zone: string = location.zone

    let newInventory: Inventory = await this.trxMgr.getRepository(Inventory).findOne({
      where: {
        palletId: inventory.palletId
      }
    })
    newInventory.status = INVENTORY_STATUS.TERMINATED
    await this.transactionInventory(newInventory, returnOrder, 0, 0, INVENTORY_TRANSACTION_TYPE.RETURN)

    newInventory.bizplace = bizplace
    newInventory.palletId = palletId
    newInventory.batchId = batchId
    newInventory.product = product
    newInventory.packingType = packingType
    newInventory.qty = qty
    newInventory.weight = weight
    newInventory.refOrderId = returnOrder.id
    if (inventory.reusablePallet?.id) {
      newInventory.reusablePallet = await this.trxMgr.getRepository(Pallet).findOne(inventory.reusablePallet.id)
    }
    newInventory.warehouse = warehouse
    newInventory.location = location
    newInventory.zone = zone
    newInventory.status = INVENTORY_STATUS.UNLOADED
    newInventory = await this.transactionInventory(
      newInventory,
      returnOrder,
      newInventory.qty,
      newInventory.weight,
      INVENTORY_TRANSACTION_TYPE.UNLOADING
    )

    targetInventory.actualPalletQty++
    targetInventory.actualPackQty += qty
    targetInventory.status = ORDER_PRODUCT_STATUS.UNLOADED
    targetInventory.updater = this.user
    this.updateOrderTargets([targetInventory])
  }

  async undoUnloadReturning(worksheetDetailName: string, palletId: string): Promise<void> {
    const worksheetDetail: WorksheetDetail = await this.findWorksheetDetailByName(worksheetDetailName, [
      'targetInventory',
      'worksheet',
      'worksheet.returnOrder'
    ])
    this.checkRecordValidity(worksheetDetail, {
      status: (status: string) => {
        const availableStatus: string[] = [WORKSHEET_STATUS.EXECUTING, WORKSHEET_STATUS.PARTIALLY_UNLOADED]
        if (availableStatus.indexOf(status) < 0) {
          throw new Error(
            this.ERROR_MSG.VALIDITY.UNEXPECTED_FIELD_VALUE('status', 'Executing or Partially Unloaded', status)
          )
        }
        return true
      }
    })

    const worksheet: Worksheet = worksheetDetail.worksheet
    const returnOrder: ReturnOrder = worksheet.returnOrder

    let inventory: Inventory = await this.trxMgr.getRepository(Inventory).findOne({
      where: { domain: this.domain, status: INVENTORY_STATUS.UNLOADED, palletId },
      relations: ['location']
    })

    const qty: number = inventory.qty

    let targetInventory: OrderInventory = worksheetDetail.targetInventory
    targetInventory.actualPackQty -= qty
    targetInventory.actualPalletQty--
    targetInventory.status = ORDER_PRODUCT_STATUS.UNLOADING
    targetInventory.updater = this.user
    await this.updateOrderTargets([targetInventory])

    worksheetDetail.status = WORKSHEET_STATUS.EXECUTING
    worksheetDetail.updater = this.user
    await this.trxMgr.getRepository(WorksheetDetail).save(worksheetDetail)

    inventory.lastSeq++
    inventory.status = INVENTORY_STATUS.DELETED
    inventory.qty = 0
    inventory.weight = 0
    inventory.updater = this.user
    inventory = await this.transactionInventory(
      inventory,
      returnOrder,
      -inventory.qty,
      -inventory.weight,
      INVENTORY_TRANSACTION_TYPE.UNDO_UNLOADING
    )
    await this.trxMgr.getRepository(Inventory).delete(inventory.id)
  }

  async completeUnloadReturning(
    returnOrderNo: string,
    unloadingReturnWorksheetDetails: Partial<WorksheetDetail>[]
  ): Promise<void> {
    let returnOrder: ReturnOrder = await this.findRefOrder(
      ReturnOrder,
      { domain: this.domain, name: returnOrderNo, status: In([ORDER_STATUS.PROCESSING, ORDER_STATUS.PUTTING_AWAY]) },
      ['orderInventories']
    )

    // if (returnOrder.crossDocking) {
    //   // Picking worksheet for cross docking should be completed before complete it
    //   // Find picking worksheet
    //   const releaseGood: ReleaseGood = arrivalNotice.releaseGood
    //   const executingPickingWS: Worksheet = await this.trxMgr.getRepository(Worksheet).findOne({
    //     where: {
    //       domain: this.domain,
    //       releaseGood,
    //       type: WORKSHEET_TYPE.PICKING,
    //       status: Not(Equal(WORKSHEET_STATUS.DONE))
    //     }
    //   })

    //   if (executingPickingWS)
    //     throw new Error(`Picking should be completed before complete unloading for cross docking.`)
    // }

    if (returnOrder.orderInventories.some((oi: OrderInventory) => oi.status === ORDER_PRODUCT_STATUS.READY_TO_APPROVED)) {
      throw new Error(`There's non-approved order products`)
    }

    let worksheet: Worksheet = await this.findWorksheetByRefOrder(returnOrder, WORKSHEET_TYPE.UNLOADING_RETURN, [
      'worksheetDetails',
      'worksheetDetails.targetInventory'
    ])
    this.checkRecordValidity(worksheet, { status: WORKSHEET_STATUS.EXECUTING })

    const partiallyUnloadedCnt: number = await this.trxMgr.getRepository(Inventory).count({
      where: { domain: this.domain, refOrderId: returnOrder.id, status: INVENTORY_STATUS.PARTIALLY_UNLOADED }
    })
    if (partiallyUnloadedCnt) {
      throw new Error('There is partially unloaded pallet, generate putaway worksheet before complete unloading.')
    }

    if (unloadingReturnWorksheetDetails.some((wsd: Partial<WorksheetDetail>) => wsd.issue)) {
      const worksheetDetails: WorksheetDetail[] = worksheet.worksheetDetails
      unloadingReturnWorksheetDetails = this.renewWorksheetDetails(
        worksheetDetails,
        unloadingReturnWorksheetDetails,
        'name',
        {
          updater: this.user
        }
      )
      const worksheetDetailsWithIssue: WorksheetDetail[] = unloadingReturnWorksheetDetails.filter(
        (wsd: WorksheetDetail) => wsd.issue
      ) as WorksheetDetail[]
      if (worksheetDetailsWithIssue.length) {
        await this.trxMgr.getRepository(WorksheetDetail).save(worksheetDetailsWithIssue)
      }

      const targetInventoriesWithIssue: OrderProduct[] = worksheetDetailsWithIssue.map((wsd: WorksheetDetail) => {
        let targetInventory: OrderProduct = wsd.targetProduct
        targetInventory.remark = wsd.issue
        return targetInventory
      })
      await this.updateOrderTargets(targetInventoriesWithIssue)
    }

    if (returnOrder.status !== ORDER_STATUS.PUTTING_AWAY) {
      await this.completWorksheet(worksheet, ORDER_STATUS.READY_TO_PUTAWAY)
    } else {
      await this.completWorksheet(worksheet)
    }
  }

  async completeUnloadReturnPartially(
    returnOrderNo: string,
    unloadingReturnWorksheetDetails: Partial<WorksheetDetail>
  ): Promise<Worksheet> {
    const returnOrder: ReturnOrder = await this.findRefOrder(ReturnOrder, {
      name: returnOrderNo,
      status: ORDER_STATUS.PROCESSING
    })

    const worksheet: Worksheet = await this.findWorksheetByRefOrder(returnOrder, WORKSHEET_TYPE.UNLOADING_RETURN, [
      'worksheetDetails',
      'worksheetDetails.targetInventory'
    ])
    this.checkRecordValidity(worksheet, { status: WORKSHEET_STATUS.EXECUTING })

    let worksheetDetail: WorksheetDetail = worksheet.worksheetDetails.find(
      (wsd: WorksheetDetail) => wsd.name === unloadingReturnWorksheetDetails.name
    )
    worksheetDetail.status = WORKSHEET_STATUS.PARTIALLY_UNLOADED
    worksheetDetail.issue = unloadingReturnWorksheetDetails.issue || worksheetDetail.issue
    worksheetDetail.updater = this.user
    worksheetDetail = await this.trxMgr.getRepository(WorksheetDetail).save(worksheetDetail)

    let targetInventory: OrderInventory = worksheetDetail.targetInventory
    targetInventory.status = ORDER_PRODUCT_STATUS.PARTIALLY_UNLOADED
    targetInventory.remark = worksheetDetail.issue || targetInventory.remark
    await this.updateOrderTargets([targetInventory])

    let inventories: Inventory[] = await this.trxMgr.getRepository(Inventory).find({
      where: {
        domain: this.domain,
        refOrderId: returnOrder.id,
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

  async createPalletizingWSDs(
    bizplace: Bizplace,
    returnOrder: ReturnOrder,
    worksheetDetails: WorksheetDetail[],
    palletizingWSDs: UnloadingReturningWorksheetDetail[]
  ): Promise<void> {
    let palletizingOrderVASs: Partial<OrderVas>[] = []

    for (let palletizingWSD of palletizingWSDs) {
      const palletizingVAS: Vas = await this.trxMgr.getRepository(Vas).findOne({
        where: { domain: this.domain, id: palletizingWSD.palletizingVasId }
      })

      const targetInventory: OrderInventory = worksheetDetails.find(
        (wsd: WorksheetDetail) => wsd.name === palletizingWSD.name
      )

      palletizingOrderVASs.push({
        domain: this.domain,
        bizplace,
        name: OrderNoGenerator.orderVas(),
        returnOrder,
        vas: palletizingVAS,
        targetType: VAS_TARGET_TYPES.BATCH_AND_PRODUCT_TYPE,
        targetBatchId: targetInventory.batchId,
        targetProduct: targetInventory.product,
        packingType: targetInventory.packingType,
        description: palletizingWSD.palletizingDescription,
        type: ORDER_TYPES.RETURN_ORDER,
        status: ORDER_VAS_STATUS.COMPLETED,
        creator: this.user,
        updater: this.user
      })
    }

    this.trxMgr.getRepository(OrderVas).save(palletizingOrderVASs)

    let vasWorksheet: Worksheet = await this.findWorksheetByRefOrder(returnOrder, WORKSHEET_TYPE.VAS)
    if (!vasWorksheet) {
      this.generateVasWorksheet(returnOrder)
    } else {
      await this.createWorksheetDetails(vasWorksheet, WORKSHEET_TYPE.VAS, palletizingOrderVASs)
    }
  }

  filterPalletizingWSDs(unloadingWSDs: UnloadingReturningWorksheetDetail[]): UnloadingReturningWorksheetDetail[] {
    return unloadingWSDs.filter((wsd: UnloadingReturningWorksheetDetail) => wsd.palletQty && wsd.palletizingDescription)
  }
}
