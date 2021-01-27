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
  VAS_TARGET_TYPES,
  VAS_TYPES
} from '@things-factory/sales-base'
import {
  Inventory,
  InventoryHistory,
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
    let worksheetDetail: WorksheetDetail = await this.findActivatableWorksheetDetailByName(
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
    await this.checkPalletDuplication(palletId)

    const worksheetDetail: WorksheetDetail = await this.trxMgr.getRepository(WorksheetDetail).findOne({
      where: {
        name: worksheetDetailName,
        type: WORKSHEET_TYPE.UNLOADING,
        status: Not(Equal(WORKSHEET_STATUS.DEACTIVATED))
      },
      relations: [
        'bizplace',
        'worksheet',
        'worksheet.arrivalNotice',
        'worksheet.bufferLocation',
        'worksheet.bufferLocation.warehouse',
        'targetProduct',
        'targetProduct.product'
      ]
    })
    if (!worksheetDetail) throw new Error(this.ERROR_MSG.FIND.NO_RESULT(worksheetDetailName))

    const bizplace: Bizplace = worksheetDetail.bizplace
    const worksheet: Worksheet = worksheetDetail.worksheet
    const arrivalNotice: ArrivalNotice = worksheet.arrivalNotice
    const targetProduct: OrderProduct = worksheetDetail.targetProduct
    const batchId: string = targetProduct.batchId
    const product: Product = targetProduct.product
    const packingType: string = targetProduct.packingType
    const uom: string = targetProduct.uom
    const remark: string = targetProduct.remark
    const qty: number = inventory.qty
    const weight: number = Math.round(qty * targetProduct.weight * 100) / 100
    const uomValue: number = Math.round(qty * targetProduct.uomValue * 100) / 100
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
    newInventory.uom = uom
    newInventory.remark = remark
    newInventory.qty = qty
    newInventory.weight = weight
    newInventory.uomValue = uomValue
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
      newInventory.uomValue,
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
    inventory = await this.transactionInventory(
      inventory,
      arrivalNotice,
      -inventory.qty,
      -inventory.uomValue,
      INVENTORY_TRANSACTION_TYPE.UNDO_UNLOADING
    )
    inventory.qty = 0
    inventory.weight = 0
    inventory.uomValue = 0
    inventory.updater = this.user

    await this.trxMgr.getRepository(InventoryHistory).update({ inventory }, { inventory: null })

    await this.trxMgr.getRepository(Inventory).delete({ id: inventory.id })
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
      'worksheetDetails.targetProduct.product',
      'worksheetDetails.targetVas'
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
    } catch (e) {
      // Do nothing
    }

    return worksheet
  }

  async completeUnloading(
    arrivalNoticeNo: string,
    unloadingWorksheetDetails: Partial<WorksheetDetail>[]
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

    if (unloadingWorksheetDetails.some((wsd: Partial<WorksheetDetail>) => wsd.issue)) {
      const worksheetDetails: WorksheetDetail[] = worksheet.worksheetDetails
      unloadingWorksheetDetails = this.renewWorksheetDetails(worksheetDetails, unloadingWorksheetDetails, 'name', {
        updater: this.user
      })
      const worksheetDetailsWithIssue: WorksheetDetail[] = unloadingWorksheetDetails.filter(
        (wsd: WorksheetDetail) => wsd.issue
      ) as WorksheetDetail[]
      if (worksheetDetailsWithIssue.length) {
        await this.trxMgr.getRepository(WorksheetDetail).save(worksheetDetailsWithIssue)
      }

      const targetProductsWithIssue: OrderProduct[] = worksheetDetailsWithIssue.map((wsd: WorksheetDetail) => {
        let targetProduct: OrderProduct = wsd.targetProduct
        targetProduct.issue = wsd.issue
        return targetProduct
      })
      await this.updateOrderTargets(targetProductsWithIssue)
    }

    if (arrivalNotice.status !== ORDER_STATUS.PUTTING_AWAY) {
      await this.completeWorksheet(worksheet, ORDER_STATUS.READY_TO_PUTAWAY)
    } else {
      await this.completeWorksheet(worksheet)
    }

    let vasWorksheet: Worksheet = await this.trxMgr.getRepository(Worksheet).findOne({
      where: {
        arrivalNotice,
        type: WORKSHEET_TYPE.VAS
      },
      relations: ['worksheetDetails', 'worksheetDetails.targetVas', 'worksheetDetails.targetVas.vas']
    })

    if (vasWorksheet) {
      let serviceVasWorksheetDetails: WorksheetDetail[] = vasWorksheet.worksheetDetails.filter(
        x => x.targetVas.vas.type == VAS_TYPES.SERVICE && x.status != WORKSHEET_STATUS.DONE
      )
      let materialsVasWorksheetDetails: WorksheetDetail[] = vasWorksheet.worksheetDetails.filter(
        x => x.targetVas.vas.type == VAS_TYPES.MATERIALS
      )
      materialsVasWorksheetDetails.forEach((wsd: WorksheetDetail) => {
        wsd.status = WORKSHEET_STATUS.DONE
        wsd.updater = this.user
      })
      await this.trxMgr.getRepository(WorksheetDetail).save(materialsVasWorksheetDetails)

      let targetVASs: OrderVas[] = materialsVasWorksheetDetails.map((wsd: WorksheetDetail) => {
        let targetVas: OrderVas = wsd.targetVas
        targetVas.status = ORDER_VAS_STATUS.TERMINATED
        targetVas.updater = this.user
        return targetVas
      })

      await this.updateOrderTargets(targetVASs)

      if (serviceVasWorksheetDetails.length <= 0) {
        vasWorksheet.status = WORKSHEET_STATUS.DONE
        vasWorksheet.updater = this.user

        await this.trxMgr.getRepository(Worksheet).save(vasWorksheet)
      }
    }
  }

  async completeUnloadingPartially(
    arrivalNoticeNo: string,
    unloadingWorksheetDetail: Partial<WorksheetDetail>
  ): Promise<Worksheet> {
    const arrivalNotice: ArrivalNotice = await this.findRefOrder(ArrivalNotice, {
      name: arrivalNoticeNo,
      status: In([ORDER_STATUS.PROCESSING, ORDER_STATUS.PUTTING_AWAY])
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
    targetProduct.issue = worksheetDetail.issue
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

    let vasWorksheet: Worksheet = await this.trxMgr.getRepository(Worksheet).findOne({
      where: {
        arrivalNotice,
        type: WORKSHEET_TYPE.VAS
      },
      relations: ['worksheetDetails', 'worksheetDetails.targetVas', 'worksheetDetails.targetVas.vas']
    })

    if (vasWorksheet) {
      let serviceVasWorksheetDetails: WorksheetDetail[] = vasWorksheet.worksheetDetails.filter(
        x => x.targetVas.vas.type == VAS_TYPES.SERVICE && x.status != WORKSHEET_STATUS.DONE
      )
      let materialsVasWorksheetDetails: WorksheetDetail[] = vasWorksheet.worksheetDetails.filter(
        x => x.targetVas.vas.type == VAS_TYPES.MATERIALS
      )
      materialsVasWorksheetDetails.forEach((wsd: WorksheetDetail) => {
        wsd.status = WORKSHEET_STATUS.DONE
        wsd.updater = this.user
      })
      await this.trxMgr.getRepository(WorksheetDetail).save(materialsVasWorksheetDetails)

      let targetVASs: OrderVas[] = materialsVasWorksheetDetails.map((wsd: WorksheetDetail) => {
        let targetVas: OrderVas = wsd.targetVas
        targetVas.status = ORDER_VAS_STATUS.TERMINATED
        targetVas.updater = this.user
        return targetVas
      })

      await this.updateOrderTargets(targetVASs)

      if (serviceVasWorksheetDetails.length <= 0) {
        vasWorksheet.status = WORKSHEET_STATUS.DONE
        vasWorksheet.updater = this.user

        await this.trxMgr.getRepository(Worksheet).save(vasWorksheet)
      }
    }

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
    palletizingWSDs: UnloadingWorksheetDetail[]
  ): Promise<void> {
    let palletizingOrderVASs: OrderVas[] = []
    let currentSetNo: number = 1

    if (worksheetDetails.some((wd: WorksheetDetail) => wd.targetVas)) {
      const getSetNo: number[] = worksheetDetails.map((wd: WorksheetDetail) => wd.targetVas.set)

      if (getSetNo.length > 0) {
        currentSetNo = Math.max(...getSetNo) + 1
      }
    }

    for (let palletizingWSD of palletizingWSDs) {
      const palletizingVAS: Vas = await this.trxMgr.getRepository(Vas).findOne({
        where: { domain: this.domain, id: palletizingWSD.palletizingVasId }
      })

      const targetProduct: OrderProduct = worksheetDetails.find(
        (wsd: WorksheetDetail) => wsd.name === palletizingWSD.name
      ).targetProduct

      let palletizingOrderVas: OrderVas = new OrderVas()
      palletizingOrderVas.domain = this.domain
      palletizingOrderVas.bizplace = bizplace
      palletizingOrderVas.name = OrderNoGenerator.orderVas()
      palletizingOrderVas.arrivalNotice = arrivalNotice
      palletizingOrderVas.vas = palletizingVAS
      palletizingOrderVas.set = currentSetNo
      palletizingOrderVas.targetType = VAS_TARGET_TYPES.BATCH_AND_PRODUCT_TYPE
      palletizingOrderVas.targetBatchId = targetProduct.batchId
      palletizingOrderVas.qty = targetProduct.packQty
      palletizingOrderVas.targetProduct = targetProduct.product
      palletizingOrderVas.packingType = targetProduct.packingType
      palletizingOrderVas.description = palletizingWSD.palletizingDescription
      palletizingOrderVas.type = ORDER_TYPES.ARRIVAL_NOTICE
      palletizingOrderVas.status = ORDER_VAS_STATUS.COMPLETED
      palletizingOrderVas.creator = this.user
      palletizingOrderVas.updater = this.user

      palletizingOrderVas = await this.trxMgr.getRepository(OrderVas).save(palletizingOrderVas)
      palletizingOrderVASs.push(palletizingOrderVas)

      currentSetNo++
    }

    let vasWorksheet: Worksheet = await this.findWorksheetByRefOrder(arrivalNotice, WORKSHEET_TYPE.VAS)
    if (!vasWorksheet) {
      await this.generateVasWorksheet(arrivalNotice)
    } else {
      await this.createWorksheetDetails(vasWorksheet, WORKSHEET_TYPE.VAS, palletizingOrderVASs)
    }
  }

  filterPalletizingWSDs(unloadingWSDs: UnloadingWorksheetDetail[]): UnloadingWorksheetDetail[] {
    return unloadingWSDs.filter((wsd: UnloadingWorksheetDetail) => wsd.palletQty && wsd.palletizingDescription)
  }
}
