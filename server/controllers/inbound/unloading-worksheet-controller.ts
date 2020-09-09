import { Bizplace } from '@things-factory/biz-base'
import { Product } from '@things-factory/product-base'
import {
  ArrivalNotice,
  OrderNoGenerator,
  OrderProduct,
  OrderVas,
  ORDER_PRODUCT_STATUS,
  ORDER_STATUS,
  ORDER_TYPES,
  ORDER_VAS_STATUS,
  ReleaseGood,
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
import { Equal, Not } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../constants'
import { Worksheet, WorksheetDetail } from '../../entities'
import { VasWorksheetController } from '../vas/vas-worksheet-controller'
import { PutawayWorksheetController } from './putaway-worksheet-controller'

export type UnloadingWorksheetDetail = Partial<WorksheetDetail> & {
  palletizingVasId: string
  palletQty: number
  palletizingDescription: string
}

export class UnloadingWorksheetController extends VasWorksheetController {
  async generateUnloadingWorksheet(arrivalNoticeNo: string, bufferLocationId: string): Promise<Worksheet> {
    let arrivalNotice: ArrivalNotice = await this.findRefOrder(
      ArrivalNotice,
      {
        domain: this.domain,
        name: arrivalNoticeNo,
        status: ORDER_STATUS.ARRIVED
      },
      ['bizplace', 'orderProducts', 'orderVass']
    )
    const orderProducts: OrderProduct[] = arrivalNotice.orderProducts
    const orderVASs: OrderVas[] = arrivalNotice.orderVass
    const bufferLocation: Location = await this.trxMgr.getRepository(Location).findOne(bufferLocationId)

    const worksheet: Worksheet = await this.generateWorksheet(
      WORKSHEET_TYPE.UNLOADING,
      arrivalNotice,
      orderProducts,
      ORDER_STATUS.READY_TO_UNLOAD,
      ORDER_PRODUCT_STATUS.READY_TO_UNLOAD,
      { bufferLocation }
    )

    if (orderVASs?.length > 0) {
      await this.generateVasWorksheet(arrivalNotice)
    }

    return worksheet
  }

  async preunload(
    worksheetDetailName: string,
    adjustedBatchId: string,
    passedPalletQty: number,
    palletQty: number
  ): Promise<void> {
    let worksheetDetail: WorksheetDetail = await this.findExecutableWorksheetDetailByName(
      worksheetDetailName,
      WORKSHEET_TYPE.UNLOADING,
      ['targetProduct']
    )

    let targetProduct: OrderProduct = worksheetDetail.targetProduct
    const isPalletQtyChanged: boolean = passedPalletQty !== palletQty
    if (isPalletQtyChanged) targetProduct.adjustedPalletQty = passedPalletQty
    targetProduct.updater = this.user

    if (adjustedBatchId) {
      targetProduct.adjustedBatchId = adjustedBatchId
      targetProduct.status = ORDER_PRODUCT_STATUS.PENDING_APPROVAL
    } else {
      targetProduct.status = ORDER_PRODUCT_STATUS.INSPECTED
    }
    await this.updateOrderTargets([targetProduct])

    worksheetDetail.status = WORKSHEET_STATUS.INSPECTED
    worksheetDetail.updater = this.user
    await this.trxMgr.getRepository(WorksheetDetail).save(worksheetDetail)
  }

  async undoPreunload(worksheetDetailName: string): Promise<void> {
    let worksheetDetail: WorksheetDetail = await this.findWorksheetDetailByName(worksheetDetailName, ['targetProduct'])
    this.checkRecordValidity(worksheetDetail, { status: WORKSHEET_STATUS.INSPECTED })

    let targetProduct: OrderProduct = worksheetDetail.targetProduct
    targetProduct.status = ORDER_PRODUCT_STATUS.READY_TO_UNLOAD
    targetProduct.adjustedBatchId = null
    targetProduct.adjustedPalletQty = null
    targetProduct.updater = this.user
    await this.updateOrderTargets([targetProduct])

    worksheetDetail.status = WORKSHEET_STATUS.DEACTIVATED
    worksheetDetail.updater = this.user
    await this.trxMgr.getRepository(WorksheetDetail).save(worksheetDetail)
  }

  async unload(worksheetDetailName: string, inventory: Partial<Inventory>): Promise<void> {
    const palletId: string = inventory.palletId
    this.checkPalletDuplication(palletId)

    const worksheetDetail: WorksheetDetail = await this.findExecutableWorksheetDetailByName(
      worksheetDetailName,
      WORKSHEET_TYPE.UNLOADING,
      [
        'bizplace',
        'worksheet',
        'worksheet.arrivalNotice',
        'worksheet.bufferLocation',
        'worksheet.bufferLocation.warehouse',
        'targetProduct',
        'targetProduct.product'
      ]
    )

    const bizplace: Bizplace = worksheetDetail.bizplace
    const worksheet: Worksheet = worksheetDetail.worksheet
    const arrivalNotice: ArrivalNotice = worksheet.arrivalNotice
    const targetProduct: OrderProduct = worksheetDetail.targetProduct
    const batchId: string = targetProduct.batchId
    const product: Product = targetProduct.product
    const packingType: string = targetProduct.packingType
    const qty: number = inventory.qty
    const weight: number = Math.round(qty * targetProduct.weight * 100) / 100
    const location: Location = worksheet.bufferLocation
    const warehouse: Warehouse = location.warehouse
    const zone: string = location.zone

    let newInventory: Partial<Inventory> = new Inventory()
    newInventory.bizplace = bizplace
    newInventory.name = InventoryNoGenerator.inventoryName()
    newInventory.palletId = palletId
    newInventory.batchId = batchId
    newInventory.product = product
    newInventory.packingType = packingType
    newInventory.qty = qty
    newInventory.weight = weight
    newInventory.refOrderId = arrivalNotice.id
    if (inventory.reusablePallet?.id) {
      newInventory.reusablePallet = await this.trxMgr.getRepository(Pallet).findOne(inventory.reusablePallet.id)
    }
    newInventory.orderProductId = targetProduct.id
    newInventory.warehouse = warehouse
    newInventory.location = location
    newInventory.zone = zone
    newInventory.status = INVENTORY_STATUS.UNLOADED
    newInventory = await this.transactionInventory(
      newInventory,
      arrivalNotice,
      newInventory.qty,
      newInventory.weight,
      INVENTORY_TRANSACTION_TYPE.UNLOADING
    )

    targetProduct.actualPalletQty++
    targetProduct.actualPackQty += qty
    targetProduct.status = ORDER_PRODUCT_STATUS.UNLOADED
    targetProduct.updater = this.user
    this.updateOrderTargets([targetProduct])
  }

  async undoUnload(worksheetDetailName: string, palletId: string): Promise<void> {
    const worksheetDetail: WorksheetDetail = await this.findWorksheetDetailByName(worksheetDetailName, [
      'targetProduct',
      'worksheet',
      'worksheet.arrivalNotice'
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
    const arrivalNotice: ArrivalNotice = worksheet.arrivalNotice

    let inventory: Inventory = await this.trxMgr.getRepository(Inventory).findOne({
      where: { domain: this.domain, status: INVENTORY_STATUS.UNLOADED, palletId },
      relations: ['location']
    })

    const qty: number = inventory.qty

    let targetProduct: OrderProduct = worksheetDetail.targetProduct
    targetProduct.actualPackQty -= qty
    targetProduct.actualPalletQty--
    targetProduct.status = ORDER_PRODUCT_STATUS.UNLOADING
    targetProduct.updater = this.user
    await this.updateOrderTargets([targetProduct])

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
      arrivalNotice,
      -inventory.qty,
      -inventory.weight,
      INVENTORY_TRANSACTION_TYPE.UNDO_UNLOADING
    )
    await this.trxMgr.getRepository(Inventory).delete(inventory.id)
  }

  async activateUnloading(
    worksheetNo: string,
    unloadingWorksheetDetails: UnloadingWorksheetDetail[]
  ): Promise<Worksheet> {
    let worksheet: Worksheet = await this.findActivatableWorksheet(worksheetNo, WORKSHEET_TYPE.UNLOADING, [
      'bizplace',
      'arrivalNotice',
      'worksheetDetails',
      'worksheetDetails.targetProduct',
      'worksheetDetails.targetProduct.product'
    ])

    const bizplace: Bizplace = worksheet.bizplace
    let worksheetDetails: WorksheetDetail[] = worksheet.worksheetDetails

    const targetProducts: OrderProduct[] = worksheetDetails.map((wsd: WorksheetDetail) => {
      let targetProduct: OrderProduct = wsd.targetProduct

      if (!targetProduct.palletQty) {
        const { palletQty }: { palletQty: number } = this.findMatchedWSD(wsd.name, unloadingWorksheetDetails)
        targetProduct.palletQty = palletQty
      }
      targetProduct.status = ORDER_PRODUCT_STATUS.UNLOADING
      targetProduct.updater = this.user

      return targetProduct
    })
    await this.updateOrderTargets(targetProducts)

    let arrivalNotice: ArrivalNotice = worksheet.arrivalNotice
    arrivalNotice.status = ORDER_STATUS.PROCESSING
    arrivalNotice.updater = this.user
    this.updateRefOrder(arrivalNotice)

    const palletizingWSDs: UnloadingWorksheetDetail[] = this.filterPalletizingWSDs(unloadingWorksheetDetails)
    if (palletizingWSDs.length > 0) {
      this.createPalletizingWSDs(bizplace, arrivalNotice, worksheetDetails, unloadingWorksheetDetails)
    }

    worksheet = await this.activateWorksheet(worksheet, worksheetDetails, unloadingWorksheetDetails)

    try {
      const vasWorksheet: Worksheet = await this.findWorksheetByRefOrder(arrivalNotice, WORKSHEET_TYPE.VAS)
      if (vasWorksheet) {
        await this.activateVAS(vasWorksheet.name, vasWorksheet.worksheetDetails)
      }
    } catch (e) {}

    return worksheet
  }

  async completeUnloading(
    arrivalNoticeNo: string,
    unloadingWorksheetDetails: Partial<WorksheetDetail>[]
  ): Promise<void> {
    let arrivalNotice: ArrivalNotice = await this.findRefOrder(
      ArrivalNotice,
      { domain: this.domain, name: arrivalNoticeNo, status: ORDER_STATUS.PROCESSING },
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

    const worksheetDetails: WorksheetDetail[] = worksheet.worksheetDetails
    unloadingWorksheetDetails = this.renewWorksheetDetails(worksheetDetails, unloadingWorksheetDetails, {
      status: WORKSHEET_STATUS.DONE,
      updater: this.user
    })

    unloadingWorksheetDetails.forEach((wsd: WorksheetDetail) => {
      wsd.targetProduct.remark = wsd.issue || wsd.targetProduct.remark
    })

    if (arrivalNotice.status !== ORDER_STATUS.PUTTING_AWAY) {
      arrivalNotice.status = ORDER_STATUS.READY_TO_PUTAWAY
      arrivalNotice.updater = this.user
      arrivalNotice = await this.updateRefOrder(arrivalNotice)
    }

    const inventories: Inventory[] = await this.trxMgr.getRepository(Inventory).find({
      where: {
        domain: this.domain,
        refOrderId: arrivalNotice.id,
        status: INVENTORY_STATUS.UNLOADED
      }
    })

    const putawayWorksheetController: PutawayWorksheetController = new PutawayWorksheetController(
      this.trxMgr,
      this.domain,
      this.user
    )
    let putawayWorksheet: Worksheet = await putawayWorksheetController.generatePutawayWorksheet(
      arrivalNoticeNo,
      inventories
    )

    if (!putawayWorksheet?.worksheetDetails?.length) {
      putawayWorksheet = await this.findWorksheetByNo(putawayWorksheet.name)
    }

    if (putawayWorksheet?.status === WORKSHEET_STATUS.DEACTIVATED) {
      await putawayWorksheetController.activatePutaway(putawayWorksheet.name, putawayWorksheet.worksheetDetails)
    }

    await this.completWorksheet(worksheet)
  }

  async completeUnloadingPartially(
    arrivalNoticeNo: string,
    unloadingWorksheetDetail: Partial<WorksheetDetail>
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
      (wsd: WorksheetDetail) => wsd.name === unloadingWorksheetDetail.name
    )
    worksheetDetail.status = WORKSHEET_STATUS.PARTIALLY_UNLOADED
    worksheetDetail.issue = unloadingWorksheetDetail.issue || worksheetDetail.issue
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
      .filter((orderProduct: OrderProduct) => !orderProduct.adjustedPalletQty)
      .map((orderProduct: OrderProduct) => {
        orderProduct.status = ORDER_PRODUCT_STATUS.READY_TO_UNLOAD
        orderProduct.updater = this.user
      })
    await this.updateOrderTargets(unloadableOrderProducts)

    let unloadingWorksheet: Worksheet = await this.findWorksheetByRefOrder(arrivalNotice, WORKSHEET_TYPE.UNLOADING)
    unloadingWorksheet.status = WORKSHEET_STATUS.PENDING_ADJUSTMENT
    unloadingWorksheet.updater = this.user
    return await this.trxMgr.getRepository(Worksheet).save(unloadingWorksheet)
  }

  async createPalletizingWSDs(
    bizplace: Bizplace,
    arrivalNotice: ArrivalNotice,
    worksheetDetails: WorksheetDetail[],
    palletizingWSDs: UnloadingWorksheetDetail[]
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

  filterPalletizingWSDs(unloadingWSDs: UnloadingWorksheetDetail[]): UnloadingWorksheetDetail[] {
    return unloadingWSDs.filter((wsd: UnloadingWorksheetDetail) => wsd.palletQty && wsd.palletizingDescription)
  }
}
