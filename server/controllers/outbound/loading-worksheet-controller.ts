import { Bizplace } from '@things-factory/biz-base'
import {
  DeliveryOrder,
  OrderInventory,
  OrderNoGenerator,
  ORDER_INVENTORY_STATUS,
  ORDER_STATUS,
  ReleaseGood
} from '@things-factory/sales-base'
import { Inventory, INVENTORY_TRANSACTION_TYPE } from '@things-factory/warehouse-base'
import { Equal, Not } from 'typeorm'
import { WORKSHEET_STATUS, WORKSHEET_TYPE } from '../../constants'
import { Worksheet, WorksheetDetail } from '../../entities'
import { generateInventoryHistory } from '../../utils'
import { VasWorksheetController } from '../vas/vas-worksheet-controller'

export class LoadingWorksheetController extends VasWorksheetController {
  async generateLoadingWorksheet(
    releaseGoodNo: string,
    targetInventories: Partial<OrderInventory>[]
  ): Promise<Worksheet> {
    const releaseGood: ReleaseGood = await this.findRefOrder(
      ReleaseGood,
      { domain: this.domain, name: releaseGoodNo },
      ['bizplace']
    )
    return await this.generateWorksheet(
      WORKSHEET_TYPE.LOADING,
      releaseGood,
      targetInventories,
      ORDER_STATUS.LOADING,
      ORDER_INVENTORY_STATUS.LOADING
    )
  }

  async activateLoading(worksheetNo: string, loadingWorksheetDetails: Partial<WorksheetDetail>[]): Promise<Worksheet> {
    const worksheet: Worksheet = await this.findActivatableWorksheet(worksheetNo, WORKSHEET_TYPE.LOADING, [
      'releaseGood',
      'worksheetDetails',
      'worksheetDetails.targetInventory'
    ])

    let releaseGood: ReleaseGood = worksheet.releaseGood
    const nonFinishedVasCnt: number = await this.trxMgr.getRepository(Worksheet).count({
      where: {
        domain: this.domain,
        releaseGood,
        type: WORKSHEET_TYPE.VAS,
        status: Not(Equal(WORKSHEET_STATUS.DONE))
      }
    })
    if (nonFinishedVasCnt) return

    const worksheetDetails: WorksheetDetail[] = worksheet.worksheetDetails
    let targetInventories: OrderInventory[] = worksheetDetails.map((wsd: WorksheetDetail) => wsd.targetInventory)

    targetInventories = targetInventories
      .filter(targetInventory => targetInventory.status == ORDER_INVENTORY_STATUS.PICKED)
      .map((targetInventory: OrderInventory) => {
        targetInventory.status = ORDER_INVENTORY_STATUS.LOADING
        targetInventory.updater = this.user
        return targetInventory
      })

    releaseGood.status = ORDER_STATUS.LOADING
    releaseGood.updater = this.user
    await this.updateRefOrder(releaseGood)

    if (targetInventories.length > 0) await this.updateOrderTargets(targetInventories)
    return await this.activateWorksheet(worksheet, worksheetDetails, loadingWorksheetDetails)
  }

  async loading(
    releaseGoodNo: string,
    worksheetDetails: Partial<WorksheetDetail & { loadedQty: number }>[]
  ): Promise<void> {
    const releaseGood: ReleaseGood = await this.findRefOrder(
      ReleaseGood,
      { domain: this.domain, name: releaseGoodNo },
      ['bizplace']
    )
    const bizplace: Bizplace = releaseGood.bizplace

    for (let worksheetDetail of worksheetDetails) {
      const loadedQty: number = worksheetDetail.loadedQty
      worksheetDetail = await this.findExecutableWorksheetDetailByName(worksheetDetail.name, WORKSHEET_TYPE.LOADING, [
        'worksheet',
        'targetInventory',
        'targetInventory.inventory'
      ])

      const worksheet: Worksheet = worksheetDetail.worksheet
      let targetInventory: OrderInventory = worksheetDetail.targetInventory
      const pickedQty: number = targetInventory.releaseQty
      let inventory: Inventory = targetInventory.inventory

      if (loadedQty > pickedQty) {
        throw new Error(this.ERROR_MSG.VALIDITY.CANT_PROCEED_STEP_BY('load', `loaded quantity can't exceed picked qty`))
      } else if (loadedQty == pickedQty) {
        // Change status of current worksheet detail
        worksheetDetail.status = WORKSHEET_STATUS.DONE
        worksheetDetail.updater = this.user
        await this.trxMgr.getRepository(WorksheetDetail).save(worksheetDetail)

        // Change status of order inventory
        targetInventory.status = ORDER_INVENTORY_STATUS.LOADED
        targetInventory.updater = this.user
        await this.updateOrderTargets([targetInventory])
      } else if (loadedQty < pickedQty) {
        const remainQty: number = pickedQty - loadedQty
        const loadedWeight: number = parseFloat(((targetInventory.releaseWeight / pickedQty) * loadedQty).toFixed(2))
        const remainWeight: number = parseFloat((targetInventory.releaseWeight - loadedWeight).toFixed(2))

        targetInventory.status = ORDER_INVENTORY_STATUS.LOADED
        targetInventory.releaseQty = loadedQty
        targetInventory.releaseWeight = loadedWeight
        targetInventory.updater = this.user
        await this.updateOrderTargets([targetInventory])

        worksheetDetail.status = WORKSHEET_STATUS.DONE
        worksheetDetail.updater = this.user
        worksheetDetail = await this.trxMgr.getRepository(WorksheetDetail).save(worksheetDetail)

        // Create order inventory for remaining item
        let newTargetInventory: Partial<OrderInventory> = Object.assign({}, targetInventory)
        delete newTargetInventory.id
        newTargetInventory.domain = this.domain
        newTargetInventory.bizplace = bizplace
        newTargetInventory.name = OrderNoGenerator.orderInventory()
        newTargetInventory.releaseGood = releaseGood
        newTargetInventory.status = ORDER_INVENTORY_STATUS.LOADING
        newTargetInventory.releaseQty = remainQty
        newTargetInventory.releaseWeight = remainWeight
        newTargetInventory.creator = this.user
        newTargetInventory.updater = this.user
        newTargetInventory = await this.trxMgr.getRepository(OrderInventory).save(newTargetInventory)

        await this.createWorksheetDetails(worksheet, WORKSHEET_TYPE.LOADING, [newTargetInventory], {
          status: WORKSHEET_STATUS.EXECUTING
        })
      }

      await generateInventoryHistory(
        inventory,
        releaseGood,
        INVENTORY_TRANSACTION_TYPE.LOADING,
        0,
        0,
        this.user,
        this.trxMgr
      )
    }
  }

  async undoLoading(deliveryOrder: Partial<DeliveryOrder>, palletIds: string[]): Promise<void> {
    deliveryOrder = await this.findRefOrder(DeliveryOrder, { id: deliveryOrder.id, domain: this.domain }, [
      'releaseGood'
    ])

    const releaseGood: ReleaseGood = deliveryOrder.releaseGood

    const targetInventories: OrderInventory[] = await this.trxMgr.getRepository(OrderInventory).find({
      where: { domain: this.domain, deliveryOrder, status: ORDER_INVENTORY_STATUS.LOADED },
      relations: ['inventory']
    })
    // Filter out inventories which is included palletIds list.
    let undoTargetOrderInventories: OrderInventory[] = targetInventories.filter(
      (targetInventory: OrderInventory) =>
        targetInventory.status === ORDER_INVENTORY_STATUS.LOADED &&
        palletIds.includes(targetInventory.inventory.palletId)
    )

    // If there was remained items => Merge into previous order inventories
    for (let undoTargetOrderInventory of undoTargetOrderInventories) {
      undoTargetOrderInventory.deliveryOrder = null
      undoTargetOrderInventory.updater = this.user

      let prevTargetInventory: OrderInventory = await this.trxMgr.getRepository(OrderInventory).findOne({
        where: {
          domain: this.domain,
          id: Not(Equal(undoTargetOrderInventory.id)),
          releaseGood,
          status: ORDER_INVENTORY_STATUS.LOADING,
          inventory: undoTargetOrderInventory.inventory
        }
      })

      if (prevTargetInventory) {
        // If there's prev target inventory
        // Merge qty and weight into prev target inventory
        prevTargetInventory.releaseQty += undoTargetOrderInventory.releaseQty
        prevTargetInventory.releaseWeight += undoTargetOrderInventory.releaseWeight
        prevTargetInventory.updater = this.user
        await this.updateOrderTargets([prevTargetInventory])

        // Terminate undo target order inventory
        undoTargetOrderInventory.status = ORDER_INVENTORY_STATUS.TERMINATED
        await this.updateOrderTargets([undoTargetOrderInventory])

        // Delete worksheet detail
        await this.trxMgr.getRepository(WorksheetDetail).delete({
          targetInventory: undoTargetOrderInventory,
          type: WORKSHEET_TYPE.LOADING,
          status: WORKSHEET_STATUS.DONE
        })
      } else {
        // Update undo target inventory
        undoTargetOrderInventory.status = ORDER_INVENTORY_STATUS.LOADING
        await this.updateOrderTargets([undoTargetOrderInventory])

        // Update worksheet detail to be able to load
        let undoTargetWorksheetDetail: WorksheetDetail = await this.findWorksheetDetail({
          targetInventory: undoTargetOrderInventory,
          type: WORKSHEET_TYPE.LOADING,
          status: WORKSHEET_STATUS.DONE
        })
        undoTargetWorksheetDetail.status = WORKSHEET_STATUS.EXECUTING
        undoTargetWorksheetDetail.updater = this.user
        await this.trxMgr.getRepository(WorksheetDetail).save(undoTargetWorksheetDetail)
      }

      // Create inventory history
      let inventory: Inventory = undoTargetOrderInventory.inventory
      await generateInventoryHistory(inventory, releaseGood, INVENTORY_TRANSACTION_TYPE.UNDO_LOADING, 0, 0, this.user)
    }

    // Compare total inventories length and undo target inventories length
    // to check whether there's more order inventories
    // If thres' no more remove delivery order
    if (targetInventories.length === undoTargetOrderInventories.length) {
      await this.trxMgr.getRepository(DeliveryOrder).delete(deliveryOrder.id)
    }
  }

  async completeLoading(releaseGoodNo: string): Promise<Worksheet> {
    const releaseGood: ReleaseGood = await this.findRefOrder(ReleaseGood, {
      domain: this.domain,
      name: releaseGoodNo,
      status: ORDER_STATUS.LOADING
    })

    const worksheet: Worksheet = await this.findWorksheetByRefOrder(releaseGood, WORKSHEET_TYPE.LOADING, [
      'worksheetDetails',
      'worksheetDetails.targetInventory'
    ])
    this.checkRecordValidity(worksheet, { status: WORKSHEET_STATUS.EXECUTING })

    return await this.completeWorksheet(worksheet, ORDER_STATUS.DONE)
  }
}
